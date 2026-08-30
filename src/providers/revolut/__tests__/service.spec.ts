import RevolutPaymentProviderService, { toMinor } from "../service"

const OPTIONS = {
  apiKey: "sk_test",
  webhookSecret: "wsk_test",
  redirectUrl: "https://store.test/return",
  sandbox: true,
}

const service = () =>
  new RevolutPaymentProviderService(
    {},
    OPTIONS
  ) as RevolutPaymentProviderService

const mockFetch = (responses: Array<{ status?: number; body: unknown }>) => {
  const calls: Array<{ url: string; method: string }> = []
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string }
    calls.push({ url: String(url), method: i.method ?? "GET" })
    const next = responses.shift() ?? { body: {} }
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      text: async () => JSON.stringify(next.body),
    }
  }) as unknown as typeof fetch
  return calls
}

const order = (state: string) => ({
  id: "ord_1",
  token: "tok_1",
  type: "payment",
  state,
  amount: 1234,
  currency: "GBP",
  merchant_order_data: { reference: "payses_1" },
})

afterEach(() => jest.restoreAllMocks())

describe("validateOptions", () => {
  it("requires every secret", () => {
    for (const missing of ["apiKey", "webhookSecret", "redirectUrl"]) {
      const opts = { ...OPTIONS, [missing]: undefined }
      expect(() =>
        RevolutPaymentProviderService.validateOptions(opts as never)
      ).toThrow(missing)
    }
    expect(() =>
      RevolutPaymentProviderService.validateOptions(OPTIONS)
    ).not.toThrow()
  })
})

describe("cancelPayment", () => {
  it("cancels orders Revolut still allows cancelling", async () => {
    for (const state of ["pending", "authorised"]) {
      const calls = mockFetch([
        { body: order(state) },
        { body: order("cancelled") },
      ])
      const res = await service().cancelPayment({ data: { id: "ord_1" } })
      expect((res.data as { state: string }).state).toBe("cancelled")
      expect(calls[1]).toEqual({
        url: "https://sandbox-merchant.revolut.com/api/orders/ord_1/cancel",
        method: "POST",
      })
    }
  })

  // Reporting success here would let Medusa delete the session or stamp canceled_at while
  // Revolut is still processing, or has already captured, the money.
  it("refuses to report success for orders it cannot cancel", async () => {
    for (const state of ["processing", "completed"]) {
      mockFetch([{ body: order(state) }])
      await expect(
        service().cancelPayment({ data: { id: "ord_1" } })
      ).rejects.toThrow(`is ${state} and cannot be canceled`)
    }
  })

  it("is a no-op for terminal states and for rollback without an id", async () => {
    for (const state of ["cancelled", "failed"]) {
      const calls = mockFetch([{ body: order(state) }])
      await service().cancelPayment({ data: { id: "ord_1" } })
      expect(calls).toHaveLength(1) // retrieved, never cancelled
    }

    // Initiation rollback passes the original input, which carries no order id.
    const calls = mockFetch([])
    await expect(service().cancelPayment({ data: {} })).resolves.toEqual({
      data: {},
    })
    expect(calls).toHaveLength(0)
  })
})

describe("capturePayment", () => {
  it("never calls Revolut, since automatic capture already did", async () => {
    const calls = mockFetch([{ body: order("completed") }])
    await service().capturePayment({ data: { id: "ord_1" } })
    expect(calls.every((c) => c.method === "GET")).toBe(true)
  })

  it("refuses to confirm a capture that has not happened", async () => {
    mockFetch([{ body: order("authorised") }])
    await expect(
      service().capturePayment({ data: { id: "ord_1" } })
    ).rejects.toThrow("not completed")
  })
})

describe("refundPayment", () => {
  it("throws rather than risking a double refund", async () => {
    await expect(
      service().refundPayment({ data: { id: "ord_1" }, amount: 10 })
    ).rejects.toThrow("Refund the order from the Revolut dashboard")
  })
})

describe("safe integer guard", () => {
  it("rejects amounts that Number would silently round", () => {
    expect(() => toMinor("90071992547409.93", "GBP")).toThrow(
      "safe integer range"
    )
    expect(toMinor("99999.99", "GBP")).toBe(9999999)
  })
})
