// Mirrors placeRevolutOrder() exactly: complete cart -> refetch order with field expansion ->
// find the revolut session -> resolve checkout_url.
const M = "http://localhost:9000",
  PK = process.env.PK,
  REGION = process.env.REGION
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
let pass = 0,
  fail = 0
const ck = (l, c, d = "") => {
  c ? pass++ : fail++
  console.log(`  [${c ? "PASS" : "FAIL"}] ${l}${d ? ` — ${d}` : ""}`)
}

const { body: p } = await store("/store/products?limit=1&fields=*variants")
const { body: c } = await store("/store/carts", {
  method: "POST",
  body: { region_id: REGION, email: "sf@t.local" },
})
const cart = c.cart.id
await store(`/store/carts/${cart}/line-items`, {
  method: "POST",
  body: { variant_id: p.products[0].variants[0].id, quantity: 1 },
})
await store(`/store/carts/${cart}`, {
  method: "POST",
  body: {
    shipping_address: {
      first_name: "S",
      last_name: "F",
      address_1: "1 St",
      city: "London",
      country_code: "gb",
      postal_code: "E1 1AA",
    },
  },
})
const { body: so } = await store(`/store/shipping-options?cart_id=${cart}`)
if (so.shipping_options?.length)
  await store(`/store/carts/${cart}/shipping-methods`, {
    method: "POST",
    body: { option_id: so.shipping_options[0].id },
  })
const { body: pc } = await store("/store/payment-collections", {
  method: "POST",
  body: { cart_id: cart },
})
const { body: sb } = await store(
  `/store/payment-collections/${pc.payment_collection.id}/payment-sessions`,
  { method: "POST", body: { provider_id: "pp_revolut_revolut" } }
)

// The storefront's payment step filters on status === "pending".
const s0 = sb.payment_collection.payment_sessions.at(-1)
ck(
  "session is 'pending' so the stock starter renders it",
  s0.status === "pending",
  `got ${s0.status}`
)
ck("no checkout_url yet", !s0.data?.checkout_url)

// Step 1 of placeRevolutOrder
const cc = await store(`/store/carts/${cart}/complete`, { method: "POST" })
ck("cart.complete returns an order", cc.body.type === "order", cc.body.type)
const orderId = cc.body.order?.id

// Step 2: refetch with expansion (cart.complete does not include sessions)
await new Promise((r) => setTimeout(r, 400))
const { status: ost, body: ob } = await store(
  `/store/orders/${orderId}?fields=*payment_collections.payment_sessions`
)
console.log(
  "     refetch HTTP",
  ost,
  "| collections:",
  ob.order?.payment_collections?.length,
  "| sessions:",
  ob.order?.payment_collections?.flatMap((x) => x.payment_sessions ?? []).length
)
const sess = ob.order?.payment_collections
  ?.flatMap((x) => x.payment_sessions ?? [])
  .find((x) => x.provider_id?.startsWith("pp_revolut"))
ck("revolut session found on the order", !!sess, sess?.provider_id)
const url = sess?.data?.checkout_url
ck(
  "checkout_url resolved for redirect",
  typeof url === "string" && url.startsWith("http"),
  url
)
ck(
  "session is pending_authorization after completion",
  sess?.status === "pending_authorization",
  sess?.status
)

// The URL must actually be reachable.
if (url) {
  const r = await fetch(url)
  ck("checkout_url is reachable", r.status === 200, `HTTP ${r.status}`)
}
console.log(`\n${pass} passed, ${fail} failed`)
