import { verifySignature } from "../webhook"
import { fromMinor, toMinor } from "../service"
import crypto from "node:crypto"

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
const ok = (...args: Parameters<typeof verifySignature>) =>
  verifySignature(...args).ok

describe("webhook signature", () => {
  it("verifies the vector published by Revolut", () => {
    expect(ok(BODY, h(), SECRET, NOW)).toBe(true)
  })

  it("accepts a Buffer body, which is what Medusa actually delivers", () => {
    expect(ok(Buffer.from(BODY), h(), SECRET, NOW)).toBe(true)
  })

  it("hashes non-UTF8 bytes exactly rather than decoding them", () => {
    const bytes = Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])
    const ts = String(Date.now())
    const sig =
      "v1=" +
      crypto
        .createHmac("sha256", SECRET)
        .update(`v1.${ts}.`)
        .update(bytes)
        .digest("hex")
    expect(ok(bytes, h(sig, ts), SECRET)).toBe(true)
    // Decoding would substitute U+FFFD and change the signed content.
    expect(Buffer.from(String(bytes)).length).not.toBe(bytes.length)
  })

  it("fails when the body is altered", () => {
    expect(ok(BODY + " ", h(), SECRET, NOW)).toBe(false)
    expect(ok(JSON.stringify(JSON.parse(BODY)), h(), SECRET, NOW)).toBe(false)
  })

  it("fails on the wrong secret, and never authenticates an empty one", () => {
    expect(ok(BODY, h(), "wsk_wrong", NOW)).toBe(false)

    // An empty string is a usable HMAC key, so a signature forged with it must not pass.
    const forged =
      "v1=" +
      crypto.createHmac("sha256", "").update(`v1.${TS}.${BODY}`).digest("hex")
    expect(ok(BODY, h(forged), "", NOW)).toBe(false)
    expect(ok(BODY, h(), undefined as unknown as string, NOW)).toBe(false)
  })

  it("enforces the five-minute window and rejects future timestamps", () => {
    expect(ok(BODY, h(), SECRET, Number(TS) + 299_000)).toBe(true)
    expect(ok(BODY, h(), SECRET, Number(TS) + 301_000)).toBe(false)
    expect(ok(BODY, h(), SECRET, Number(TS) - 1_000)).toBe(false)
  })

  it("rejects timestamps that Number() would silently coerce", () => {
    for (const bad of ["", " ", "+1683650202360", "1.6836502e12", "0x1"]) {
      expect(ok(BODY, h(SIG, bad), SECRET, NOW)).toBe(false)
    }
  })

  it("accepts any signature in a rotating pair", () => {
    expect(ok(BODY, h(`v1=${"0".repeat(64)},${SIG}`), SECRET, NOW)).toBe(true)
  })

  it("rejects malformed signatures without throwing", () => {
    // 67 JS chars but 131 UTF-8 bytes: this used to reach timingSafeEqual and crash the process.
    const multibyte = "v1=" + "\u00e9".repeat(64)
    expect(multibyte.length).toBe(SIG.length)
    expect(ok(BODY, h(multibyte), SECRET, NOW)).toBe(false)

    expect(ok(BODY, h("v1=abc"), SECRET, NOW)).toBe(false)
    expect(ok(BODY, h(`v2=${"0".repeat(64)}`), SECRET, NOW)).toBe(false)
    expect(ok(BODY, h(SIG.toUpperCase()), SECRET, NOW)).toBe(false)
    expect(ok(BODY, h(""), SECRET, NOW)).toBe(false)
    expect(ok(BODY, h(","), SECRET, NOW)).toBe(false)
  })

  it("rejects missing headers and non-string bodies", () => {
    expect(ok(BODY, { "revolut-signature": SIG }, SECRET, NOW)).toBe(false)
    expect(ok(BODY, {}, SECRET, NOW)).toBe(false)
    expect(ok(undefined as unknown as string, h(), SECRET, NOW)).toBe(false)
  })

  it("reads repeated headers delivered as arrays", () => {
    const headers = {
      "revolut-request-timestamp": [TS],
      "revolut-signature": [SIG],
    }
    expect(ok(BODY, headers, SECRET, NOW)).toBe(true)
  })
})

describe("minor units", () => {
  it("converts the currencies that do not have two decimals", () => {
    expect(toMinor(50, "GBP")).toBe(5000)
    expect(toMinor(5000, "JPY")).toBe(5000)
    expect(toMinor(50, "KWD")).toBe(50000)
  })

  it("round-trips", () => {
    expect(fromMinor(5000, "GBP")).toBe(50)
    expect(fromMinor(5000, "JPY")).toBe(5000)
    expect(fromMinor(50000, "KWD")).toBe(50)
  })

  // Math.round(1.005 * 100) is 100 because of float representation. MathBN is exact.
  it("does not lose the half cent that float math drops", () => {
    expect(Math.round(1.005 * 100)).toBe(100)
    expect(toMinor("1.005", "GBP")).toBe(101)
  })
})
