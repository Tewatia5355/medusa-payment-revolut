// Adversarial probes against the REDESIGNED flow (order created during cart completion).
// Each targets a risk the redesign itself introduced.
const M = "http://localhost:9000"
const K = "http://localhost:4555"
const PK = "pk_0780d378dab92f2e37caf377269f99391007a66508acc61f1c85966d5ce92950"
const REGION = "reg_01M1A0045KNAA65DZS61AEWB17"
const { execSync } = await import("node:child_process")
const crypto = await import("node:crypto")

const store = async (p, o = {}) => {
  const r = await fetch(M + p, {
    ...o,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PK,
    },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const t = await r.text()
  return { status: r.status, body: t ? JSON.parse(t) : {} }
}
const mock = (p, b) =>
  fetch(K + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b ?? {}),
  }).then((r) => r.json())
const q = (s) =>
  execSync(`docker exec medusa-pg psql -U medusa -d medusa -tAc "${s}"`)
    .toString()
    .trim()
const calls = () => fetch(K + "/_test/calls").then((r) => r.json())

const webhook = (orderId, ref) => {
  const body = JSON.stringify({
    event: "ORDER_COMPLETED",
    order_id: orderId,
    merchant_order_ext_ref: ref,
  })
  const ts = String(Date.now())
  const sig =
    "v1=" +
    crypto
      .createHmac("sha256", "wsk_mocksecret")
      .update(`v1.${ts}.${body}`)
      .digest("hex")
  return fetch(M + "/hooks/revolut", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "revolut-request-timestamp": ts,
      "revolut-signature": sig,
    },
    body,
  })
}

let pass = 0,
  fail = 0
const check = (l, c, d = "") => {
  c ? pass++ : fail++
  console.log(`  [${c ? "PASS" : "FAIL"}] ${l}${d ? ` — ${d}` : ""}`)
}

async function cart({ shipping = true } = {}) {
  const { body: p } = await store("/store/products?limit=1&fields=*variants")
  const { body: c } = await store("/store/carts", {
    method: "POST",
    body: { region_id: REGION, email: "adv@t.local" },
  })
  const id = c.cart.id
  await store(`/store/carts/${id}/line-items`, {
    method: "POST",
    body: { variant_id: p.products[0].variants[0].id, quantity: 1 },
  })
  if (shipping) {
    await store(`/store/carts/${id}`, {
      method: "POST",
      body: {
        shipping_address: {
          first_name: "A",
          last_name: "D",
          address_1: "1 St",
          city: "London",
          country_code: "gb",
          postal_code: "E1 1AA",
        },
      },
    })
    const { body: so } = await store(`/store/shipping-options?cart_id=${id}`)
    if (so.shipping_options?.length)
      await store(`/store/carts/${id}/shipping-methods`, {
        method: "POST",
        body: { option_id: so.shipping_options[0].id },
      })
  }
  const { body: pc } = await store("/store/payment-collections", {
    method: "POST",
    body: { cart_id: id },
  })
  const col = pc.payment_collection.id
  const { body: sb } = await store(
    `/store/payment-collections/${col}/payment-sessions`,
    { method: "POST", body: { provider_id: "pp_revolut_revolut" } }
  )
  return {
    cartId: id,
    col,
    sessionId: sb.payment_collection.payment_sessions.at(-1).id,
  }
}
const sess = (id) =>
  JSON.parse(q(`select data::text from payment_session where id='${id}'`))

// A1. Concurrent cart.complete: does the redesign create two chargeable Revolut orders?
async function concurrentComplete() {
  console.log("\nA1. Concurrent cart.complete on one cart")
  const { cartId, col, sessionId } = await cart()
  const before = (await calls()).filter(
    (c) => c.method === "POST" && c.path === "/api/orders"
  ).length
  const res = await Promise.all(
    [1, 2, 3].map(() =>
      store(`/store/carts/${cartId}/complete`, { method: "POST" })
    )
  )
  const after = (await calls()).filter(
    (c) => c.method === "POST" && c.path === "/api/orders"
  ).length
  const created = after - before
  console.log(`     complete statuses: ${res.map((r) => r.status).join(",")}`)
  check("at most one Revolut order created", created <= 1, `created ${created}`)
  const orders = q(
    `select count(*) from order_payment_collection where payment_collection_id='${col}'`
  )
  check("at most one Medusa order", Number(orders) <= 1, `orders ${orders}`)
  return { col, sessionId }
}

// A2. assertMatches must not permanently block recording a payment the customer already made.
async function driftAfterPayment() {
  console.log("\nA2. Remote amount drifts AFTER the customer paid")
  const { cartId, col, sessionId } = await cart()
  await store(`/store/carts/${cartId}/complete`, { method: "POST" })
  const d = sess(sessionId)
  await mock(`/_test/state/${d.id}`, { state: "completed" })
  // Hostile or buggy drift: remote now disagrees with the session.
  await fetch(`${K}/api/orders/${d.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 999999 }),
  })
  const r = await webhook(d.id, sessionId)
  await new Promise((r) => setTimeout(r, 1500))
  const cap = q(
    `select coalesce(captured_amount,0) from payment_collection where id='${col}'`
  )
  const amt = q(`select amount from payment_collection where id='${col}'`)
  console.log(
    `     webhook HTTP ${r.status}, collection ${amt} captured ${cap}`
  )
  check(
    "drifted order is NOT booked at the session amount",
    !(Number(cap) > 0 && Number(cap) === Number(amt)) || r.status !== 200,
    `captured ${cap} of ${amt}`
  )
  check(
    "drift does not silently succeed",
    r.status !== 200 || Number(cap) === 0,
    `HTTP ${r.status} captured ${cap}`
  )
}

// A3. Revolut order dies (expired/cancelled) after the Medusa order exists.
async function orderDiesAfterCompletion() {
  console.log("\nA3. Revolut order cancelled after the Medusa order exists")
  const { cartId, col, sessionId } = await cart()
  await store(`/store/carts/${cartId}/complete`, { method: "POST" })
  const d = sess(sessionId)
  await mock(`/_test/state/${d.id}`, { state: "cancelled" })
  const r = await webhook(d.id, sessionId)
  await new Promise((r) => setTimeout(r, 1200))
  const cap = q(
    `select coalesce(captured_amount,0) from payment_collection where id='${col}'`
  )
  check(
    "cancelled order captures nothing",
    Number(cap) === 0,
    `captured ${cap}`
  )
  check(
    "acknowledged, not retried forever",
    r.status === 200,
    `HTTP ${r.status}`
  )
}

// A4. Switching providers after a Revolut order exists — is it orphaned or cancelled?
async function providerChurn() {
  console.log("\nA4. Switch to another provider after the Revolut order exists")
  const { cartId, col, sessionId } = await cart()
  await store(`/store/carts/${cartId}/complete`, { method: "POST" })
  const d = sess(sessionId)
  const before = (await calls()).filter((c) =>
    c.path.endsWith("/cancel")
  ).length
  const sw = await store(`/store/payment-collections/${col}/payment-sessions`, {
    method: "POST",
    body: { provider_id: "pp_system_default" },
  })
  await new Promise((r) => setTimeout(r, 800))
  const after = (await calls()).filter((c) => c.path.endsWith("/cancel")).length
  const state = await fetch(`${K}/api/orders/${d.id}`)
    .then((r) => r.json())
    .then((o) => o.state)
  console.log(`     switch HTTP ${sw.status}, revolut order now ${state}`)
  check(
    "Revolut order is cancelled, not orphaned payable",
    after > before || state === "cancelled",
    `cancel calls ${before}->${after}, state ${state}`
  )
}

// A5. Webhook for a session whose cart was never completed (no Medusa order).
async function neverCompleted() {
  console.log("\nA5. Webhook for a session whose cart was never completed")
  const { col, sessionId } = await cart({ shipping: false })
  const d = sess(sessionId)
  check("no Revolut order exists to pay", !d.id, `id ${d.id ?? "none"}`)
  const r = await webhook("00000000-0000-4000-8000-000000000000", sessionId)
  const cap = q(
    `select coalesce(captured_amount,0) from payment_collection where id='${col}'`
  )
  check("nothing captured", Number(cap) === 0, `captured ${cap}`)
  check(
    "unknown order acknowledged as terminal",
    r.status === 200,
    `HTTP ${r.status}`
  )
}

console.log("adversarial probes against the redesigned flow")
const CUT = "2026-08-30 19:06:48+00"
await concurrentComplete()
await driftAfterPayment()
await orderDiesAfterCompletion()
await providerChurn()
await neverCompleted()

console.log("\n=== ledger integrity, post-redesign rows only ===")
console.log(
  q(
    `select 'overcaptured=' || count(*) filter (where pc.captured_amount > pc.amount) || ' captured_no_order=' || count(*) filter (where opc.order_id is null and pc.captured_amount > 0) || ' collections=' || count(*) from payment_collection pc left join order_payment_collection opc on opc.payment_collection_id=pc.id where pc.created_at > '${CUT}'`
  )
)
console.log(
  q(
    `select 'max_payments_per_collection=' || coalesce(max(c),0) from (select count(*) c from payment p join payment_collection pc on pc.id=p.payment_collection_id where pc.created_at > '${CUT}' group by p.payment_collection_id) x`
  )
)
console.log(`\n${pass} passed, ${fail} failed`)
