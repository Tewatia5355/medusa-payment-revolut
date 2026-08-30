import assert from "node:assert/strict"
import crypto from "node:crypto"
import { verify } from "./verify.mjs"

// Known-answer vector: the signing secret, payload and timestamp published in Revolut's docs,
// with the digest produced by their own reference Python implementation.
// https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
const SECRET = "wsk_r59a4HfWVAKycbCaNO1RvgCJec02gRd8"
const BODY =
  '{"event": "ORDER_COMPLETED","order_id": "9fc01989-3f61-4484-a5d9-ffe768531be9","merchant_order_ext_ref": "Test #3928"}'
const TS = "1683650202360"
const SIG =
  "v1=281b1f1aebe9357b7b128fd6a3aae0fe202c901add4ce75e6d038e498871d7fd"
const NOW = Number(TS) + 1000
const h = (sig = SIG, ts = TS) => ({
  "revolut-request-timestamp": ts,
  "revolut-signature": sig,
})
const ok = (...a) => verify(...a).ok

assert.equal(ok(BODY, h(), SECRET, NOW), true, "documented vector must verify")

// Any change to the bytes invalidates the signature, so the raw body must never be re-serialized.
assert.equal(ok(BODY + " ", h(), SECRET, NOW), false, "mutated body must fail")
assert.equal(
  ok(JSON.stringify(JSON.parse(BODY)), h(), SECRET, NOW),
  false,
  "re-serialized body must fail"
)
assert.equal(ok(BODY, h(), "wsk_wrong", NOW), false, "wrong secret must fail")

// Replay window: 5 minutes, and future timestamps are rejected outright.
assert.equal(
  ok(BODY, h(), SECRET, Number(TS) + 299_000),
  true,
  "inside window must pass"
)
assert.equal(
  ok(BODY, h(), SECRET, Number(TS) + 301_000),
  false,
  "stale must fail"
)
assert.equal(
  ok(BODY, h(), SECRET, Number(TS) - 1_000),
  false,
  "future must fail"
)

// During secret rotation the header carries several signatures; any one matching is enough.
assert.equal(
  ok(BODY, h(`v1=${"0".repeat(64)},${SIG}`), SECRET, NOW),
  true,
  "rotation: second sig must pass"
)

// Malformed input must be rejected, never throw.
assert.equal(ok(BODY, h("v1=abc"), SECRET, NOW), false, "short sig must fail")
assert.equal(
  ok(BODY, h("v2=" + "0".repeat(64)), SECRET, NOW),
  false,
  "unknown version must fail"
)
assert.equal(
  ok(BODY, { "revolut-signature": SIG }, SECRET, NOW),
  false,
  "missing timestamp must fail"
)
assert.equal(
  ok(BODY, h(SIG, "not-a-number"), SECRET, NOW),
  false,
  "NaN timestamp must fail"
)

// 1. A multibyte signature used to pass a JS-length guard and then throw
//    ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH inside timingSafeEqual, killing the process.
const multibyte = "v1=" + "\u00e9".repeat(64) // 67 JS chars, 131 UTF-8 bytes
assert.equal(
  ok(BODY, h(multibyte), SECRET, NOW),
  false,
  "multibyte signature must fail"
)

// 2. An empty secret is a usable HMAC key, so a forged signature verified against it.
const forge = (s) =>
  "v1=" +
  crypto.createHmac("sha256", s).update(`v1.${TS}.${BODY}`).digest("hex")
assert.equal(
  ok(BODY, h(forge("")), "", NOW),
  false,
  "empty secret must never authenticate"
)
assert.equal(
  ok(BODY, h(SIG), undefined, NOW),
  false,
  "undefined secret must not throw or pass"
)
assert.equal(
  ok(BODY, h(SIG), null, NOW),
  false,
  "null secret must not throw or pass"
)

// Timestamp coercion edge cases that Number() would silently accept.
for (const bad of [
  "",
  " ",
  "+1683650202360",
  "1.6836502e12",
  "0x1",
  "1683650202360 ",
]) {
  assert.equal(
    ok(BODY, h(SIG, bad), SECRET, NOW),
    false,
    `timestamp ${JSON.stringify(bad)} must fail`
  )
}

// Repeated headers arrive as arrays; uppercase hex and padding must not be accepted.
assert.equal(
  ok(
    BODY,
    { "revolut-request-timestamp": [TS], "revolut-signature": [SIG] },
    SECRET,
    NOW
  ),
  true,
  "array headers must work"
)
assert.equal(
  ok(BODY, h(SIG.toUpperCase()), SECRET, NOW),
  false,
  "uppercase hex must fail"
)
assert.equal(
  ok(BODY, h(""), SECRET, NOW),
  false,
  "empty signature header must fail"
)
assert.equal(
  ok(BODY, h(","), SECRET, NOW),
  false,
  "comma-only header must fail"
)
// Medusa hands the provider `rawData` as `string | Buffer` (mutations.ts:355) and its subscriber
// rehydrates a serialized Buffer before calling us (subscriber.ts:31-33), so Buffer is the real
// production path. Rejecting it would fail every genuine webhook.
assert.equal(
  ok(Buffer.from(BODY), h(), SECRET, NOW),
  true,
  "Buffer body must verify"
)
assert.equal(
  ok(Buffer.from(BODY + " "), h(), SECRET, NOW),
  false,
  "mutated Buffer must fail"
)

// Bytes that are not valid UTF-8 must be hashed as-is; decoding them would substitute U+FFFD
// and silently change what was signed.
const rawBytes = Buffer.from([
  0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d,
])
const tsNow = String(Date.now())
const sigBytes =
  "v1=" +
  crypto
    .createHmac("sha256", SECRET)
    .update(`v1.${tsNow}.`)
    .update(rawBytes)
    .digest("hex")
assert.equal(
  ok(rawBytes, h(sigBytes, tsNow), SECRET),
  true,
  "non-UTF8 Buffer must verify byte-exact"
)

// Still reject genuinely wrong types.
assert.equal(ok(undefined, h(), SECRET, NOW), false, "undefined body must fail")
assert.equal(ok(null, h(), SECRET, NOW), false, "null body must fail")
assert.equal(ok({}, h(), SECRET, NOW), false, "object body must fail")

console.log("verify.mjs: all assertions passed")
