import crypto from "node:crypto"

// Strict format keeps timingSafeEqual from ever seeing mismatched lengths.
const SIGNATURE = /^v1=[0-9a-f]{64}$/
const TIMESTAMP = /^[0-9]+$/
const TOLERANCE_MS = 300_000

// Repeated headers arrive as arrays.
const header = (headers, name) => {
  const v = headers?.[name]
  return typeof v === "string"
    ? v
    : Array.isArray(v) && typeof v[0] === "string"
      ? v[0]
      : null
}

// https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
// Revolut-Signature = "v1=" + hex(HMAC_SHA256(secret, "v1.{timestamp}.{raw body}"))
export function verify(rawBody, headers, secret, now = Date.now()) {
  // An empty string is a usable HMAC key, so forged signatures would verify against it.
  if (typeof secret !== "string" || secret === "")
    return { ok: false, reason: "missing secret" }

  // Medusa delivers rawData as string | Buffer (mutations.ts:355).
  if (typeof rawBody !== "string" && !Buffer.isBuffer(rawBody))
    return { ok: false, reason: "raw body must be a string or Buffer" }

  const ts = header(headers, "revolut-request-timestamp")
  const signatures = header(headers, "revolut-signature")
  if (!ts || !signatures) return { ok: false, reason: "missing headers" }

  // Digits only; Number() would silently accept "", " ", "+1" and "1e3".
  if (!TIMESTAMP.test(ts)) return { ok: false, reason: "malformed timestamp" }

  // Revolut's reference implementation rejects future timestamps too.
  const age = now - Number(ts)
  if (!Number.isFinite(age) || age < 0 || age > TOLERANCE_MS)
    return { ok: false, reason: "timestamp outside tolerance" }

  // Two updates so a Buffer is hashed byte-for-byte; interpolating it would
  // decode as UTF-8 and replace invalid bytes with U+FFFD.
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`v1.${ts}.`)
    .update(rawBody)
    .digest()

  // Several signatures arrive while a secret is rotating. No early exit.
  let ok = false
  for (const candidate of signatures.split(",")) {
    const got = candidate.trim()
    if (!SIGNATURE.test(got)) continue
    if (crypto.timingSafeEqual(Buffer.from(got.slice(3), "hex"), expected))
      ok = true
  }
  return ok ? { ok: true } : { ok: false, reason: "no matching signature" }
}
