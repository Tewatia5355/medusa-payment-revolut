import crypto from "node:crypto"

// Strict format keeps timingSafeEqual from ever seeing mismatched lengths. A multibyte
// header would otherwise pass a JS-length check and throw, killing the request handler.
const SIGNATURE = /^v1=[0-9a-f]{64}$/
const TIMESTAMP = /^[0-9]+$/
const TOLERANCE_MS = 300_000
// Revolut's reference implementation rejects any future timestamp, but measured against live
// Sandbox its timestamps arrive a few milliseconds ahead of a clock that is otherwise NTP-synced
// (observed -3ms and -32ms). A strict `age >= 0` therefore drops genuine webhooks, so allow a
// bounded skew while keeping the documented staleness limit.
const CLOCK_SKEW_MS = 60_000

export type VerifyResult = { ok: true } | { ok: false; reason: string }

// Repeated headers arrive as arrays.
const header = (
  headers: Record<string, unknown> | undefined,
  name: string
): string | null => {
  const v = headers?.[name]
  return typeof v === "string"
    ? v
    : Array.isArray(v) && typeof v[0] === "string"
      ? v[0]
      : null
}

// https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
// Revolut-Signature = "v1=" + hex(HMAC_SHA256(secret, "v1.{timestamp}.{raw body}"))
export function verifySignature(
  rawBody: string | Buffer,
  headers: Record<string, unknown> | undefined,
  secret: string,
  now: number = Date.now()
): VerifyResult {
  // An empty string is a usable HMAC key, so forged signatures would verify against it.
  if (typeof secret !== "string" || secret === "") {
    return { ok: false, reason: "missing webhook secret" }
  }

  // Medusa delivers rawData as string | Buffer and its subscriber rehydrates a Buffer.
  if (typeof rawBody !== "string" && !Buffer.isBuffer(rawBody)) {
    return { ok: false, reason: "raw body must be a string or Buffer" }
  }

  const ts = header(headers, "revolut-request-timestamp")
  const signatures = header(headers, "revolut-signature")
  if (!ts || !signatures) return { ok: false, reason: "missing headers" }

  // Digits only; Number() would silently accept "", " ", "+1" and "1e3".
  if (!TIMESTAMP.test(ts)) return { ok: false, reason: "malformed timestamp" }

  const age = now - Number(ts)
  if (!Number.isFinite(age)) {
    return { ok: false, reason: "malformed timestamp" }
  }
  // Distinct reasons: the caller decides whether to retry, and a stale delivery is not the same
  // problem as one from the future.
  if (age > TOLERANCE_MS) {
    return { ok: false, reason: `stale timestamp (${age}ms old)` }
  }
  if (age < -CLOCK_SKEW_MS) {
    return { ok: false, reason: `future timestamp (${-age}ms ahead)` }
  }

  // Two updates so a Buffer is hashed byte-for-byte; interpolating it would decode as
  // UTF-8 and replace invalid bytes with U+FFFD.
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
    if (crypto.timingSafeEqual(Buffer.from(got.slice(3), "hex"), expected)) {
      ok = true
    }
  }
  return ok ? { ok: true } : { ok: false, reason: "no matching signature" }
}
