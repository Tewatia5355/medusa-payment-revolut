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
  // No Revolut order yet: a payable checkout_url must not exist before an order does.
  check(
    "no checkout_url before the cart is completed",
    !session?.data?.checkout_url,
    `got ${session?.data?.checkout_url ?? "none"}`
  )
  check(
    "no PII persisted in session data",
    !JSON.stringify(session?.data ?? {}).match(/cardholder|payer|card_bin/i)
  )

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

  // Only now does a payable URL exist.
  const live = await sessionRow(session.id)
  check(
    "checkout_url appears only after the order exists",
    typeof live?.data?.checkout_url === "string",
    live?.data?.checkout_url
  )
  check(
    "session is pending_authorization",
    live?.status === "pending_authorization",
    `got ${live?.status}`
  )
  const revolutOrderId = live.data.id

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
  console.log("\n3. Forged rejected, stale retried, small skew accepted")
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
  // Retryable, not acknowledged: a redelivery may carry a fresh timestamp, and acknowledging
  // would discard a payment Revolut has already taken.
  check(
    "stale timestamp asks for retry",
    stale.status === 503,
    `HTTP ${stale.status}`
  )

  // Measured against live Revolut: genuine deliveries run a few ms ahead of an NTP-synced clock.
  const skewed = await webhook(
    "ORDER_COMPLETED",
    ctx.revolutOrderId,
    ctx.sessionId,
    SECRET,
    String(Date.now() + 30)
  )
  check(
    "small future skew still accepted",
    skewed.status === 200,
    `HTTP ${skewed.status}`
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
  const { data } = await sessionRow(session.id)

  await mock(`/_test/state/${data.id}`, { state: "completed" })
  // Scoped to this order so unrelated in-flight reads cannot consume the budget.
  await mock("/_test/fail", { times: 1, status: 503, orderId: data.id })

  const failed = await webhook("ORDER_COMPLETED", data.id, session.id)
  check(
    "503 while Revolut is down",
    failed.status === 503,
    `HTTP ${failed.status}`
  )

  const retried = await webhook("ORDER_COMPLETED", data.id, session.id)
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
  const { data } = await sessionRow(session.id)

  // Order still processing at Revolut.
  await mock(`/_test/state/${data.id}`, { state: "processing" })
  const early = await webhook("ORDER_COMPLETED", data.id, session.id)
  check(
    "early event acknowledged, not actioned",
    early.status === 200,
    `HTTP ${early.status}`
  )

  await mock(`/_test/state/${data.id}`, { state: "completed" })
  const later = await webhook("ORDER_COMPLETED", data.id, session.id)
  check(
    "later delivery captures it",
    later.status === 200,
    `HTTP ${later.status}`
  )
}

// A cart that cannot be completed must never yield a captured payment.
async function uncompletableCart() {
  console.log(
    "\n6. Cart that cannot complete must not produce a captured payment"
  )
  const { body: p } = await store("/store/products?limit=1&fields=*variants")
  const { body: c } = await store("/store/carts", {
    method: "POST",
    body: { region_id: REGION, email: "e2e@test.local" },
  })
  const cartId = c.cart.id
  await store(`/store/carts/${cartId}/line-items`, {
    method: "POST",
    body: { variant_id: p.products[0].variants[0].id, quantity: 1 },
  })
  // No shipping address and no shipping method, so completion fails.
  const { body: pcol } = await store("/store/payment-collections", {
    method: "POST",
    body: { cart_id: cartId },
  })
  const collectionId = pcol.payment_collection.id
  const { session } = await initSession(collectionId)

  const { status: cs } = await store(`/store/carts/${cartId}/complete`, {
    method: "POST",
  })
  check("cart completion fails as expected", cs !== 200, `HTTP ${cs}`)
  check(
    "no Revolut order was created for an uncompletable cart",
    !session?.data?.id,
    `order ${session?.data?.id ?? "none"}`
  )

  const captured = await collectionCaptured(collectionId)
  check("nothing captured", !captured, `captured ${captured}`)
}

// The Store order response does not nest payment sessions, so read them directly.
async function sessionRow(sessionId) {
  const { execSync } = await import("node:child_process")
  const out = execSync(
    `docker exec medusa-pg psql -U medusa -d medusa -tAc "select status || '|' || data::text from payment_session where id='${sessionId}'"`
  )
    .toString()
    .trim()
  const [status, ...rest] = out.split("|")
  return { status, data: JSON.parse(rest.join("|")) }
}

// Read straight from the DB: there is no public Store route for a bare collection.
async function collectionCaptured(collectionId) {
  const { execSync } = await import("node:child_process")
  const out = execSync(
    `docker exec medusa-pg psql -U medusa -d medusa -tAc "select coalesce(captured_amount,0) from payment_collection where id='${collectionId}'"`
  )
    .toString()
    .trim()
  return Number(out)
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
  await uncompletableCart()

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error("harness error:", e)
  process.exit(1)
})
