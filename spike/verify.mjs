import crypto from "node:crypto"

// Verify a Revolut webhook signature.
// Algorithm: https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
//   payload_to_sign = "v1.{Revolut-Request-Timestamp}.{raw body}"
//   Revolut-Signature = "v1=" + hex(HMAC_SHA256(signing_secret, payload_to_sign))
// rawBody MUST be the exact bytes received. Parsing and re-serializing changes the signature.
export function verify(rawBody, headers, secret, now = Date.now()) {
  const ts = headers["revolut-request-timestamp"]
  const header = headers["revolut-signature"]
  if (!ts || !header) return { ok: false, reason: "missing headers" }

  // Reject future timestamps as well as stale ones, matching Revolut's reference impl.
  const age = now - Number(ts)
  if (!Number.isFinite(age) || age < 0 || age > 300_000) {
    return { ok: false, reason: "timestamp outside tolerance" }
  }

  const expected = "v1=" + crypto
    .createHmac("sha256", secret)
    .update(`v1.${ts}.${rawBody}`)
    .digest("hex")

  // The header carries several comma-separated signatures while a secret is being rotated.
  for (const candidate of String(header).split(",")) {
    const got = candidate.trim()
    if (got.length !== expected.length) continue
    if (crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      return { ok: true }
    }
  }
  return { ok: false, reason: "no matching signature" }
}
