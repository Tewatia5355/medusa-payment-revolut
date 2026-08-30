import assert from "node:assert/strict"
import crypto from "node:crypto"
import { verify } from "./verify.mjs"

// Known-answer vector: the signing secret, payload and timestamp published in Revolut's docs,
// with the digest produced by their own reference Python implementation.
// https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
const SECRET = "wsk_r59a4HfWVAKycbCaNO1RvgCJec02gRd8"
const BODY = '{"event": "ORDER_COMPLETED","order_id": "9fc01989-3f61-4484-a5d9-ffe768531be9","merchant_order_ext_ref": "Test #3928"}'
const TS = "1683650202360"
const SIG = "v1=281b1f1aebe9357b7b128fd6a3aae0fe202c901add4ce75e6d038e498871d7fd"
const NOW = Number(TS) + 1000
const h = (sig = SIG, ts = TS) => ({ "revolut-request-timestamp": ts, "revolut-signature": sig })
const ok = (...a) => verify(...a).ok

assert.equal(ok(BODY, h(), SECRET, NOW), true, "documented vector must verify")

// Any change to the bytes invalidates the signature, so the raw body must never be re-serialized.
assert.equal(ok(BODY + " ", h(), SECRET, NOW), false, "mutated body must fail")
assert.equal(ok(JSON.stringify(JSON.parse(BODY)), h(), SECRET, NOW), false, "re-serialized body must fail")
assert.equal(ok(BODY, h(), "wsk_wrong", NOW), false, "wrong secret must fail")

// Replay window: 5 minutes, and future timestamps are rejected outright.
assert.equal(ok(BODY, h(), SECRET, Number(TS) + 299_000), true, "inside window must pass")
assert.equal(ok(BODY, h(), SECRET, Number(TS) + 301_000), false, "stale must fail")
assert.equal(ok(BODY, h(), SECRET, Number(TS) - 1_000), false, "future must fail")

// During secret rotation the header carries several signatures; any one matching is enough.
assert.equal(ok(BODY, h(`v1=${"0".repeat(64)},${SIG}`), SECRET, NOW), true, "rotation: second sig must pass")

// Malformed input must be rejected, never throw.
assert.equal(ok(BODY, h("v1=abc"), SECRET, NOW), false, "short sig must fail")
assert.equal(ok(BODY, h("v2=" + "0".repeat(64)), SECRET, NOW), false, "unknown version must fail")
assert.equal(ok(BODY, { "revolut-signature": SIG }, SECRET, NOW), false, "missing timestamp must fail")
assert.equal(ok(BODY, h(SIG, "not-a-number"), SECRET, NOW), false, "NaN timestamp must fail")

// --- regressions for the two vulnerabilities found in v0.1.0 review ---

// 1. A multibyte signature used to pass a JS-length guard and then throw
//    ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH inside timingSafeEqual, killing the process.
const multibyte = "v1=" + "\u00e9".repeat(64)   // 67 JS chars, 131 UTF-8 bytes
assert.equal(multibyte.length, SIG.length, "precondition: same JS length as a real signature")
assert.notEqual(Buffer.from(multibyte).length, Buffer.from(SIG).length, "precondition: different byte length")
assert.doesNotThrow(() => verify(BODY, h(multibyte), SECRET, NOW), "multibyte signature must not throw")
assert.equal(ok(BODY, h(multibyte), SECRET, NOW), false, "multibyte signature must fail")

// 2. An empty secret is a usable HMAC key, so a forged signature verified against it.
const forge = (s) => "v1=" + crypto.createHmac("sha256", s).update(`v1.${TS}.${BODY}`).digest("hex")
assert.equal(ok(BODY, h(forge("")), "", NOW), false, "empty secret must never authenticate")
assert.equal(ok(BODY, h(SIG), undefined, NOW), false, "undefined secret must not throw or pass")
assert.equal(ok(BODY, h(SIG), null, NOW), false, "null secret must not throw or pass")

// Timestamp coercion edge cases that Number() would silently accept.
for (const bad of ["", " ", "+1683650202360", "1.6836502e12", "0x1", "1683650202360 "]) {
  assert.equal(ok(BODY, h(SIG, bad), SECRET, NOW), false, `timestamp ${JSON.stringify(bad)} must fail`)
}

// Repeated headers arrive as arrays; uppercase hex and padding must not be accepted.
assert.equal(ok(BODY, { "revolut-request-timestamp": [TS], "revolut-signature": [SIG] }, SECRET, NOW), true, "array headers must work")
assert.equal(ok(BODY, h(SIG.toUpperCase()), SECRET, NOW), false, "uppercase hex must fail")
assert.equal(ok(BODY, h(""), SECRET, NOW), false, "empty signature header must fail")
assert.equal(ok(BODY, h(","), SECRET, NOW), false, "comma-only header must fail")
assert.equal(ok(undefined, h(), SECRET, NOW), false, "non-string body must fail")

console.log("verify.mjs: 30 assertions passed")
