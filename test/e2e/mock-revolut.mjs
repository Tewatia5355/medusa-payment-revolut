#!/usr/bin/env node
// Mock Revolut Merchant API. Response shapes are copied from real Sandbox calls recorded
// during the v0.1.0 spike, so the provider is exercised against what Revolut actually returns.
//
// Control endpoints (not part of Revolut's API) drive scenarios:
//   POST /_test/state/:id      { state }     force an order's state
//   POST /_test/fail           { times, status }  make the next N order reads fail
//   GET  /_test/calls                        every request the provider made
import http from "node:http"
import crypto from "node:crypto"

const PORT = Number(process.env.PORT ?? 4555)
const WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? "wsk_mocksecret"

const orders = new Map()
const calls = []
let failNext = { times: 0, status: 503, orderId: null }

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

// Shape recorded from a real Sandbox POST /api/orders response.
const makeOrder = (body) => {
  const id = crypto.randomUUID()
  return {
    id,
    token: crypto.randomUUID(),
    type: "payment",
    state: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount: body.amount,
    currency: body.currency,
    outstanding_amount: body.amount,
    capture_mode: body.capture_mode ?? "automatic",
    checkout_url: `http://localhost:${PORT}/_checkout/${id}`,
    enforce_challenge: "automatic",
    redirect_url: body.redirect_url,
    authorisation_type: "final",
    merchant_order_data: body.merchant_order_data ?? {},
  }
}

// Sent by Revolut once a payment completes. Deliberately carries no amount, matching reality.
export const signedWebhook = (event, orderId, ref, secret = WEBHOOK_SECRET) => {
  const body = JSON.stringify({
    event,
    order_id: orderId,
    merchant_order_ext_ref: ref,
  })
  const ts = String(Date.now())
  const sig =
    "v1=" +
    crypto.createHmac("sha256", secret).update(`v1.${ts}.${body}`).digest("hex")
  return {
    body,
    headers: { "revolut-request-timestamp": ts, "revolut-signature": sig },
  }
}

const server = http.createServer((req, res) => {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8")
    const body = raw ? JSON.parse(raw) : {}
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const path = url.pathname
    calls.push({ method: req.method, path, at: Date.now() })

    // --- test control ---
    if (path === "/_test/calls") return json(res, 200, calls)
    if (path.startsWith("/_test/state/")) {
      const o = orders.get(path.split("/").pop())
      if (!o) return json(res, 404, { message: "unknown order" })
      o.state = body.state
      if (body.state === "completed") o.outstanding_amount = 0
      return json(res, 200, o)
    }
    if (path === "/_test/fail") {
      // Scoping to one order stops unrelated in-flight reads from consuming the budget.
      failNext = {
        times: body.times ?? 1,
        status: body.status ?? 503,
        orderId: body.orderId ?? null,
      }
      return json(res, 200, failNext)
    }
    if (path === "/_test/reset") {
      orders.clear()
      calls.length = 0
      failNext = { times: 0, status: 503, orderId: null }
      return json(res, 200, { ok: true })
    }

    // --- Revolut Merchant API ---
    if (req.method === "POST" && path === "/api/orders") {
      const order = makeOrder(body)
      orders.set(order.id, order)
      return json(res, 201, order)
    }

    const match = path.match(
      /^\/api\/orders\/([^/]+)(\/(cancel|capture|refund))?$/
    )
    if (match) {
      const [, id, , action] = match
      const order = orders.get(id)
      if (!order)
        return json(res, 404, { code: 1000, message: "Order not found" })

      // Simulate a transient outage on reads, which is the failure the custom route exists for.
      if (
        req.method === "GET" &&
        failNext.times > 0 &&
        (!failNext.orderId || failNext.orderId === id)
      ) {
        failNext.times -= 1
        return json(res, failNext.status, {
          code: 9999,
          message: "temporarily unavailable",
        })
      }

      if (req.method === "GET") return json(res, 200, order)
      if (action === "cancel") {
        order.state = "cancelled"
        return json(res, 200, order)
      }
      if (req.method === "PATCH") {
        Object.assign(order, body, { updated_at: new Date().toISOString() })
        return json(res, 200, order)
      }
    }

    if (path.startsWith("/_checkout/")) {
      return json(res, 200, {
        hint: "use /_test/state/:id then POST the signed webhook",
      })
    }

    json(res, 404, { code: 1000, message: `no mock for ${req.method} ${path}` })
  })
})

if (process.argv[1]?.endsWith("mock-revolut.mjs")) {
  server.listen(PORT, () => console.log(`mock revolut on :${PORT}`))
}
