import assert from "node:assert/strict"
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

assert.equal(verify(BODY, h(), SECRET, NOW).ok, true, "documented vector must verify")

// Any change to the bytes invalidates the signature, so the raw body must never be re-serialized.
assert.equal(verify(BODY + " ", h(), SECRET, NOW).ok, false, "mutated body must fail")
assert.equal(verify(JSON.stringify(JSON.parse(BODY)), h(), SECRET, NOW).ok, false, "re-serialized body must fail")

assert.equal(verify(BODY, h(), "wsk_wrong", NOW).ok, false, "wrong secret must fail")

// Replay window: 5 minutes, and future timestamps are rejected outright.
assert.equal(verify(BODY, h(), SECRET, Number(TS) + 299_000).ok, true, "inside window must pass")
assert.equal(verify(BODY, h(), SECRET, Number(TS) + 301_000).ok, false, "stale must fail")
assert.equal(verify(BODY, h(), SECRET, Number(TS) - 1_000).ok, false, "future must fail")

// During secret rotation the header carries several signatures; any one matching is enough.
assert.equal(verify(BODY, h(`v1=${"0".repeat(64)},${SIG}`), SECRET, NOW).ok, true, "rotation: second sig must pass")

// Malformed input must be rejected, not crash timingSafeEqual on a length mismatch.
assert.equal(verify(BODY, h("v1=abc"), SECRET, NOW).ok, false, "short sig must fail")
assert.equal(verify(BODY, h("v2=" + "0".repeat(64)), SECRET, NOW).ok, false, "unknown version must fail")
assert.equal(verify(BODY, { "revolut-signature": SIG }, SECRET, NOW).ok, false, "missing timestamp must fail")
assert.equal(verify(BODY, h(SIG, "not-a-number"), SECRET, NOW).ok, false, "NaN timestamp must fail")

console.log("verify.mjs: 12 assertions passed")
