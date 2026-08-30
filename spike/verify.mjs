import crypto from "node:crypto"

// Only ASCII lowercase hex is a well-formed signature. Enforcing this before any Buffer
// comparison guarantees a fixed 67-byte encoding, so timingSafeEqual can never be handed
// mismatched lengths — a multibyte header would otherwise pass a JS-length check and throw
// ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH, killing the process.
const SIGNATURE = /^v1=[0-9a-f]{64}$/
const TIMESTAMP = /^[0-9]+$/
const TOLERANCE_MS = 300_000

// Headers can arrive repeated, which Node surfaces as an array.
const header = (headers, name) => {
  const v = headers?.[name]
  return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null
}

// Verify a Revolut webhook signature.
// Algorithm: https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
//   payload_to_sign  = "v1.{Revolut-Request-Timestamp}.{raw body}"
//   Revolut-Signature = "v1=" + hex(HMAC_SHA256(signing_secret, payload_to_sign))
// rawBody MUST be the exact bytes received. Parsing and re-serializing changes the signature.
export function verify(rawBody, headers, secret, now = Date.now()) {
  // An empty secret is still a valid HMAC key, so anyone could forge a signature against it.
  if (typeof secret !== "string" || secret === "") return { ok: false, reason: "missing secret" }
  if (typeof rawBody !== "string") return { ok: false, reason: "raw body must be a string" }

  const ts = header(headers, "revolut-request-timestamp")
  const signatures = header(headers, "revolut-signature")
  if (!ts || !signatures) return { ok: false, reason: "missing headers" }

  // Digits only: rejects "", whitespace, "+1", "1e3" and other values Number() would coerce.
  if (!TIMESTAMP.test(ts)) return { ok: false, reason: "malformed timestamp" }

  // Reject stale events and, per Revolut's reference implementation, future ones too.
  const age = now - Number(ts)
  if (!Number.isFinite(age) || age < 0 || age > TOLERANCE_MS) {
    return { ok: false, reason: "timestamp outside tolerance" }
  }

  const expected = Buffer.from(
    "v1=" + crypto.createHmac("sha256", secret).update(`v1.${ts}.${rawBody}`).digest("hex"),
    "ascii"
  )

  // The header carries several comma-separated signatures while a secret is being rotated.
  // Every candidate is compared without an early exit, so the loop does not leak which matched.
  let ok = false
  for (const candidate of signatures.split(",")) {
    const got = candidate.trim()
    if (!SIGNATURE.test(got)) continue
    if (crypto.timingSafeEqual(Buffer.from(got, "ascii"), expected)) ok = true
  }
  return ok ? { ok: true } : { ok: false, reason: "no matching signature" }
}
