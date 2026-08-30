#!/usr/bin/env node
// End-to-end checkout against a real Medusa instance with a mock Revolut.
// Exercises the flow the unit tests cannot: cart -> payment session -> cart.complete ->
// webhook -> captured payment.
import crypto from "node:crypto"

const MEDUSA = "http://localhost:9000"
const MOCK = "http://localhost:4555"
const PK = process.env.PK
const REGION = process.env.REGION
const SECRET = "wsk_mocksecret"

let pass = 0
let fail = 0
const check = (label, cond, detail = "") => {
  const mark = cond ? "PASS" : "FAIL"
  cond ? pass++ : fail++
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`)
  return cond
}

const store = async (path, opts = {}) => {
  const res = await fetch(MEDUSA + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PK,
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : {} }
}

const mock = (path, body) =>
  fetch(MOCK + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json())

const webhook = (event, orderId, ref, secret = SECRET, tsOverride) => {
  const body = JSON.stringify({
    event,
    order_id: orderId,
    merchant_order_ext_ref: ref,
  })
  const ts = tsOverride ?? String(Date.now())
  const sig =
    "v1=" +
    crypto.createHmac("sha256", secret).update(`v1.${ts}.${body}`).digest("hex")
  return fetch(`${MEDUSA}/hooks/revolut`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "revolut-request-timestamp": ts,
      "revolut-signature": sig,
    },
    body,
  })
}

const paymentRow = async (sessionId) => {
  const { body } = await store(`/store/payment-collections/${sessionId}`)
  return body
}

async function buildCart() {
  const { body: p } = await store("/store/products?limit=1&fields=*variants")
  const variant = p.products[0].variants[0]

  const { body: c } = await store("/store/carts", {
    method: "POST",
    body: { region_id: REGION, email: "e2e@test.local" },
  })
  const cartId = c.cart.id

  await store(`/store/carts/${cartId}/line-items`, {
    method: "POST",
    body: { variant_id: variant.id, quantity: 1 },
  })
  await store(`/store/carts/${cartId}`, {
    method: "POST",
    body: {
      shipping_address: {
        first_name: "E2E",
        last_name: "Test",
        address_1: "1 Test St",
        city: "London",
        country_code: "gb",
        postal_code: "E1 1AA",
      },
    },
  })

  const { body: so } = await store(`/store/shipping-options?cart_id=${cartId}`)
  if (so.shipping_options?.length) {
    await store(`/store/carts/${cartId}/shipping-methods`, {
      method: "POST",
      body: { option_id: so.shipping_options[0].id },
    })
  }

  const { body: pc } = await store("/store/payment-collections", {
    method: "POST",
    body: { cart_id: cartId },
  })
  return { cartId, collectionId: pc.payment_collection.id }
}

async function initSession(collectionId) {
  const { status, body } = await store(
    `/store/payment-collections/${collectionId}/payment-sessions`,
    { method: "POST", body: { provider_id: "pp_revolut_revolut" } }
  )
  const session = body.payment_collection?.payment_sessions?.at(-1)
  return { status, body, session }
}

// ---------------------------------------------------------------- scenarios

async function happyPath() {
  console.log(
    "\n1. Happy path: order exists before payment, webhook captures it"
  )
  const { cartId, collectionId } = await buildCart()
  const { status, session } = await initSession(collectionId)

  check("payment session created", status === 200, `HTTP ${status}`)
  check(
    "session status is pending_authorization",
    session?.status === "pending_authorization",
    `got ${session?.status}`
  )
  check(
    "checkout_url returned to the storefront",
    typeof session?.data?.checkout_url === "string",
    session?.data?.checkout_url
  )
  check(
    "no PII persisted in session data",
    !JSON.stringify(session?.data ?? {}).match(/cardholder|payer|card_bin/i)
  )

  const revolutOrderId = session.data.id

  // The order must exist before the customer is redirected.
  const { status: cs, body: cb } = await store(
    `/store/carts/${cartId}/complete`,
    { method: "POST" }
  )
  check(
    "cart completes before payment",
    cs === 200 && cb.type === "order",
    `type=${cb.type} ${cb.error?.message ?? ""}`
  )
  const orderId = cb.order?.id
  check("order created awaiting payment", !!orderId, orderId)

  // Customer pays on Revolut.
  await mock(`/_test/state/${revolutOrderId}`, { state: "completed" })
  const r = await webhook("ORDER_COMPLETED", revolutOrderId, session.id)
  check("webhook accepted", r.status === 200, `HTTP ${r.status}`)

  await new Promise((r) => setTimeout(r, 1500))
  return { orderId, revolutOrderId, sessionId: session.id }
}

async function duplicateDelivery(ctx) {
  console.log("\n2. Duplicate delivery (observed live) must not double-capture")
  const before = await capturedTotal(ctx.orderId)
  await webhook("ORDER_COMPLETED", ctx.revolutOrderId, ctx.sessionId)
  await webhook("ORDER_COMPLETED", ctx.revolutOrderId, ctx.sessionId)
  await new Promise((r) => setTimeout(r, 1500))
  const after = await capturedTotal(ctx.orderId)
  check(
    "captured amount unchanged after 2 replays",
    before === after,
    `${before} -> ${after}`
  )
}

async function badSignature(ctx) {
  console.log("\n3. Forged and stale webhooks are rejected")
  const forged = await webhook(
    "ORDER_COMPLETED",
    ctx.revolutOrderId,
    ctx.sessionId,
    "wsk_wrong"
  )
  check("wrong secret rejected", forged.status === 204, `HTTP ${forged.status}`)

  const stale = await webhook(
    "ORDER_COMPLETED",
    ctx.revolutOrderId,
    ctx.sessionId,
    SECRET,
    String(Date.now() - 600_000)
  )
  check(
    "stale timestamp rejected",
    stale.status === 204,
    `HTTP ${stale.status}`
  )

  const unsigned = await fetch(`${MEDUSA}/hooks/revolut`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "ORDER_COMPLETED", order_id: "x" }),
  })
  check("unsigned rejected", unsigned.status === 204, `HTTP ${unsigned.status}`)
}

async function transientFailure() {
  console.log("\n4. Transient Revolut outage returns 503 so Revolut retries")
  const { cartId, collectionId } = await buildCart()
  const { session } = await initSession(collectionId)
  await store(`/store/carts/${cartId}/complete`, { method: "POST" })
  await mock(`/_test/state/${session.data.id}`, { state: "completed" })

  await mock("/_test/fail", { times: 1, status: 503 })
  const failed = await webhook("ORDER_COMPLETED", session.data.id, session.id)
  check(
    "503 while Revolut is down",
    failed.status === 503,
    `HTTP ${failed.status}`
  )

  const retried = await webhook("ORDER_COMPLETED", session.data.id, session.id)
  check(
    "retry succeeds once Revolut recovers",
    retried.status === 200,
    `HTTP ${retried.status}`
  )
}

async function outOfOrder() {
  console.log("\n5. ORDER_COMPLETED arriving before the order reads completed")
  const { cartId, collectionId } = await buildCart()
  const { session } = await initSession(collectionId)
  await store(`/store/carts/${cartId}/complete`, { method: "POST" })

  // Order still processing at Revolut.
  await mock(`/_test/state/${session.data.id}`, { state: "processing" })
  const early = await webhook("ORDER_COMPLETED", session.data.id, session.id)
  check(
    "early event acknowledged, not actioned",
    early.status === 200,
    `HTTP ${early.status}`
  )

  await mock(`/_test/state/${session.data.id}`, { state: "completed" })
  const later = await webhook("ORDER_COMPLETED", session.data.id, session.id)
  check(
    "later delivery captures it",
    later.status === 200,
    `HTTP ${later.status}`
  )
}

async function capturedTotal(orderId) {
  const { body } = await store(`/store/orders/${orderId}`)
  return body.order?.payment_collections?.[0]?.captured_amount ?? null
}

async function main() {
  console.log("e2e: medusa-payment-revolut against a live Medusa instance")
  const ctx = await happyPath()
  await duplicateDelivery(ctx)
  await badSignature(ctx)
  await transientFailure()
  await outOfOrder()

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error("harness error:", e)
  process.exit(1)
})
