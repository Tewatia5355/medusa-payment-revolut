#!/usr/bin/env node
// Drives the REAL compiled provider against REAL Revolut Sandbox.
// Everything since the redesign has only run against the mock; this closes that gap.
// Credentials come from env only — never written to disk.
const Svc =
  require("../../.medusa/server/src/providers/revolut/service.js").default
const {
  verifySignature,
} = require("../../.medusa/server/src/providers/revolut/webhook.js")

const apiKey = process.env.REVOLUT_SECRET_KEY
if (!apiKey) {
  console.error("set REVOLUT_SECRET_KEY")
  process.exit(1)
}

const svc = new Svc(
  {},
  {
    apiKey,
    webhookSecret: process.env.REVOLUT_WEBHOOK_SECRET ?? "wsk_placeholder",
    redirectUrl: "https://example.com/return",
    sandbox: true, // real sandbox-merchant.revolut.com, no baseUrl override
  }
)

let pass = 0,
  fail = 0
const check = (l, c, d = "") => {
  c ? pass++ : fail++
  console.log(`  [${c ? "PASS" : "FAIL"}] ${l}${d ? ` — ${d}` : ""}`)
}

const sessionId = "payses_live_" + Date.now()

async function main() {
  console.log("live sandbox verification of the redesigned flow\n")

  // 1. initiatePayment must not touch Revolut at all.
  console.log("1. initiatePayment makes no Revolut call")
  const init = await svc.initiatePayment({
    amount: 12.34,
    currency_code: "gbp",
    data: { session_id: sessionId },
  })
  check("returns status pending", init.status === "pending", init.status)
  check("no order id yet", !init.data.id)
  check("no checkout_url yet", !init.data.checkout_url)
  check(
    "amount converted to minor units",
    init.data.amount === 1234,
    String(init.data.amount)
  )

  // 2. authorizePayment creates the order at real Revolut.
  console.log("\n2. authorizePayment creates the order at Revolut")
  const auth = await svc.authorizePayment({ data: init.data })
  check("order created", typeof auth.data.id === "string", auth.data.id)
  check(
    "status is pending_authorization",
    auth.status === "pending_authorization",
    auth.status
  )
  check("checkout_url returned", typeof auth.data.checkout_url === "string")
  check(
    "reference round-tripped",
    auth.data.reference === sessionId,
    auth.data.reference
  )
  check("amount matches", auth.data.amount === 1234, String(auth.data.amount))
  check(
    "projection carries no PII",
    !/cardholder|payer|card_bin|token/i.test(JSON.stringify(auth.data)),
    Object.keys(auth.data).join(",")
  )

  const orderId = auth.data.id

  // 3. Re-authorizing must retrieve, not create a second order.
  console.log(
    "\n3. Re-authorization retrieves rather than creating another order"
  )
  const again = await svc.authorizePayment({ data: auth.data })
  check("same order id", again.data.id === orderId, again.data.id)

  // 4. The ext-ref filter used by orphan recovery.
  console.log("\n4. Orphan recovery filter works on real Revolut")
  const found = await svc.retrievePayment({ data: auth.data })
  check("retrievePayment resolves", found.data.id === orderId)
  const res = await fetch(
    `https://sandbox-merchant.revolut.com/api/orders?merchant_order_data_reference=${sessionId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Revolut-Api-Version": "2026-04-20",
      },
    }
  )
  const list = await res.json()
  check(
    "exactly one order matches the session reference",
    list.orders?.length === 1,
    String(list.orders?.length)
  )

  // 5. assertMatches against a real response.
  console.log("\n5. Drift detection against a real order")
  try {
    await svc.authorizePayment({ data: { ...auth.data, amount: 999999 } })
    check("drifted amount rejected", false, "no throw")
  } catch (e) {
    check(
      "drifted amount rejected",
      e.message.includes("[revolut:conflict]"),
      e.message.slice(0, 80)
    )
  }
  try {
    await svc.authorizePayment({ data: { ...auth.data, currency: "EUR" } })
    check("drifted currency rejected", false, "no throw")
  } catch (e) {
    check(
      "drifted currency rejected",
      e.message.includes("[revolut:conflict]"),
      e.message.slice(0, 60)
    )
  }

  // 6. getPaymentStatus maps a real state.
  console.log("\n6. State mapping against real Revolut")
  const st = await svc.getPaymentStatus({ data: auth.data })
  check(
    "pending order maps to pending_authorization",
    st.status === "pending_authorization",
    st.status
  )

  // 7. capturePayment must refuse an uncaptured order.
  console.log("\n7. capturePayment refuses an order Revolut has not completed")
  try {
    await svc.capturePayment({ data: auth.data })
    check("refused", false, "no throw")
  } catch (e) {
    check(
      "refused",
      e.message.includes("not completed"),
      e.message.slice(0, 60)
    )
  }

  // 8. Cancel a real pending order.
  console.log("\n8. cancelPayment against a real pending order")
  const cancelled = await svc.cancelPayment({ data: auth.data })
  check(
    "order cancelled",
    cancelled.data.state === "cancelled",
    cancelled.data.state
  )
  const post = await svc.getPaymentStatus({ data: auth.data })
  check("maps to canceled", post.status === "canceled", post.status)

  // 9. Cancelling a terminal order must not throw.
  console.log("\n9. Cancelling an already-cancelled order is a no-op")
  const twice = await svc.cancelPayment({ data: auth.data })
  check("no-op, no throw", twice.data.state === "cancelled", twice.data.state)

  // 10. Unknown order is terminal, so webhooks for it are acknowledged not retried.
  console.log("\n10. Unknown order is terminal")
  try {
    await svc.retrievePayment({
      data: { id: "00000000-0000-4000-8000-000000000000" },
    })
    check("404 surfaces", false, "no throw")
  } catch (e) {
    check(
      "404 surfaces as NOT_FOUND",
      e.type === "not_found" || /404/.test(e.message),
      e.type ?? e.message.slice(0, 40)
    )
  }

  // 11. A second order for the payable-webhook phase.
  console.log("\n11. Order for the live webhook phase")
  const s2 = "payses_live_" + Date.now()
  const i2 = await svc.initiatePayment({
    amount: 1.5,
    currency_code: "gbp",
    data: { session_id: s2 },
  })
  const a2 = await svc.authorizePayment({ data: i2.data })
  check("payable order created", !!a2.data.checkout_url)
  console.log(`\n     PAY THIS to test a real signed webhook (GBP 1.50):`)
  console.log(`     ${a2.data.checkout_url}`)
  console.log(`     order:   ${a2.data.id}`)
  console.log(`     session: ${s2}`)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error("harness error:", e.message)
  process.exit(1)
})
