import {
  AbstractPaymentProvider,
  BigNumber,
  MathBN,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  BigNumberInput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { verifySignature } from "./webhook"

export type RevolutOptions = {
  apiKey: string
  webhookSecret: string
  redirectUrl: string
  sandbox?: boolean
}

type OrderState =
  "pending" | "processing" | "authorised" | "completed" | "cancelled" | "failed"

type RevolutOrder = {
  id: string
  token: string
  type: string
  state: OrderState
  amount: number
  currency: string
  checkout_url?: string
  merchant_order_data?: { reference?: string }
}

// Pinned, not configurable. The header is required on these endpoints and an omitted
// optional version resolves to the earliest supported one.
const API_VERSION = "2026-04-20"

// `authorised` is transient under automatic capture (processing -> authorised -> completed).
// Mapping it to AUTHORIZED would expose a capturable Payment during that window, and
// CapturePaymentInput carries no amount, so a partial capture would charge the full order.
const STATUS: Record<OrderState, PaymentSessionStatus> = {
  pending: PaymentSessionStatus.PENDING_AUTHORIZATION,
  processing: PaymentSessionStatus.PENDING_AUTHORIZATION,
  authorised: PaymentSessionStatus.PENDING_AUTHORIZATION,
  completed: PaymentSessionStatus.CAPTURED,
  cancelled: PaymentSessionStatus.CANCELED,
  failed: PaymentSessionStatus.ERROR,
}

const minorDigits = (currency: string): number =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).resolvedOptions().maximumFractionDigits ?? 2

export const toMinor = (amount: BigNumberInput, currency: string): number => {
  const minor = Math.round(
    new BigNumber(MathBN.mult(amount, 10 ** minorDigits(currency))).numeric
  )
  // BigNumber.numeric goes through Number, which silently rounds past 2^53.
  if (!Number.isSafeInteger(minor)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Amount ${amount} ${currency} exceeds the safe integer range for minor units`
    )
  }
  return minor
}

export const fromMinor = (amount: number, currency: string): number => {
  if (!Number.isSafeInteger(amount)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Revolut returned amount ${amount} outside the safe integer range`
    )
  }
  return new BigNumber(MathBN.div(amount, 10 ** minorDigits(currency))).numeric
}

// Retrieved orders carry cardholder name, payer email and card BIN. Only these fields
// are persisted to PaymentSession/Payment data.
const project = (order: RevolutOrder) => ({
  id: order.id,
  state: order.state,
  amount: order.amount,
  currency: order.currency,
  reference: order.merchant_order_data?.reference,
  checkout_url: order.checkout_url,
})

export default class RevolutPaymentProviderService extends AbstractPaymentProvider<RevolutOptions> {
  static identifier = "revolut"

  constructor(cradle: Record<string, unknown>, options: RevolutOptions) {
    super(cradle, options)
  }

  static validateOptions(options: RevolutOptions): void {
    for (const key of ["apiKey", "webhookSecret", "redirectUrl"] as const) {
      if (!options?.[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_ARGUMENT,
          `Revolut payment provider requires the "${key}" option`
        )
      }
    }
  }

  private get baseUrl(): string {
    return this.config.sandbox
      ? "https://sandbox-merchant.revolut.com"
      : "https://merchant.revolut.com"
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; idempotencyKey?: string } = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Revolut-Api-Version": API_VERSION,
        "Content-Type": "application/json",
        ...(init.idempotencyKey
          ? { "Idempotency-Key": init.idempotencyKey }
          : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })

    const text = await res.text()
    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Revolut ${init.method ?? "GET"} ${path} failed with ${res.status}: ${text}`
      )
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  private orderId(data: Record<string, unknown> | undefined): string {
    const id = data?.id
    if (typeof id !== "string" || !id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Missing Revolut order id in payment data"
      )
    }
    return id
  }

  private retrieveOrder(id: string): Promise<RevolutOrder> {
    return this.request<RevolutOrder>(`/api/orders/${id}`)
  }

  async initiatePayment({
    amount,
    currency_code,
    data,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = data?.session_id as string | undefined

    const order = await this.request<RevolutOrder>("/api/orders", {
      method: "POST",
      body: {
        amount: toMinor(amount, currency_code),
        currency: currency_code.toUpperCase(),
        capture_mode: "automatic",
        // Carried back on webhooks as merchant_order_ext_ref, and filterable via
        // ?merchant_order_data_reference= — the only link back to the Medusa session.
        merchant_order_data: { reference: sessionId },
        redirect_url: this.config.redirectUrl,
        // Rollback calls deletePayment with the original input.data, which has neither the
        // order id nor the session id, so an orphan can only be cleaned up by expiry.
        expire_pending_after: "PT30M",
      },
    })

    return {
      id: order.id,
      data: project(order),
      status: STATUS[order.state],
    }
  }

  // Returns pending_authorization until Revolut reports `completed`, so the cart completes and
  // an awaiting-payment order exists before the customer is redirected. Completing afterwards
  // would risk a captured payment with no order.
  async authorizePayment({
    data,
  }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const order = await this.retrieveOrder(this.orderId(data))
    return { data: project(order), status: STATUS[order.state] }
  }

  async getPaymentStatus({
    data,
  }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const order = await this.retrieveOrder(this.orderId(data))
    return { data: project(order), status: STATUS[order.state] }
  }

  async retrievePayment({
    data,
  }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const order = await this.retrieveOrder(this.orderId(data))
    return { data: project(order) }
  }

  // Automatic capture means Revolut has already captured by the time the order reads
  // `completed`. Capturing again is never correct, so this only confirms terminal state.
  async capturePayment({
    data,
  }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const order = await this.retrieveOrder(this.orderId(data))
    if (order.state !== "completed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Revolut order ${order.id} is ${order.state}, not completed`
      )
    }
    return { data: project(order) }
  }

  // Revolut only accepts cancellation for pending or uncaptured authorised orders. Reporting
  // success for any other state is unsafe: Medusa deletes the session (payment-module
  // deletePaymentSession) or stamps canceled_at regardless of what Revolut actually did.
  async cancelPayment({
    data,
  }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const id = data?.id
    // Initiation rollback calls this with the original input, which has no order id.
    if (typeof id !== "string" || !id) {
      return { data }
    }

    const order = await this.retrieveOrder(id)
    switch (order.state) {
      case "pending":
      case "authorised": {
        const cancelled = await this.request<RevolutOrder>(
          `/api/orders/${id}/cancel`,
          { method: "POST" }
        )
        return { data: project(cancelled) }
      }
      case "cancelled":
      case "failed":
        return { data: project(order) }
      default:
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Revolut order ${id} is ${order.state} and cannot be canceled`
        )
    }
  }

  // Medusa calls this with the original input.data on initiation rollback, so the order id is
  // usually absent. expire_pending_after is what actually reclaims an orphan.
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input)
  }

  async updatePayment({
    amount,
    currency_code,
    data,
  }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const id = this.orderId(data)
    const order = await this.request<RevolutOrder>(`/api/orders/${id}`, {
      method: "PATCH",
      body: {
        amount: toMinor(amount, currency_code),
        currency: currency_code.toUpperCase(),
      },
    })
    return { data: project(order), status: STATUS[order.state] }
  }

  // Deferred to v1.1.0. Revolut accepts a refund asynchronously, but Medusa deletes its Refund
  // record when the provider throws; a retry then generates a new refund id, which is also the
  // idempotency key, so an ambiguous failure could refund twice.
  async refundPayment(
    _input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Refunds are not supported by medusa-payment-revolut v1. Refund the order from the Revolut dashboard."
    )
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const verified = verifySignature(
      payload.rawData,
      payload.headers,
      this.config.webhookSecret
    )
    if (!verified.ok) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        `Rejected Revolut webhook: ${verified.reason}`
      )
    }

    const event = payload.data as { event?: string; order_id?: string }
    if (event?.event !== "ORDER_COMPLETED" || !event.order_id) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    // Webhooks carry no amount and merchant_order_ext_ref is optional, but WebhookActionData
    // requires both session_id and amount, so the order is always retrieved.
    const order = await this.retrieveOrder(event.order_id)
    const sessionId = order.merchant_order_data?.reference
    if (order.type !== "payment" || !sessionId || order.state !== "completed") {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    return {
      action: PaymentActions.SUCCESSFUL,
      data: {
        session_id: sessionId,
        amount: fromMinor(order.amount, order.currency),
      },
    }
  }
}
