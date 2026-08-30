#!/usr/bin/env node
// v0.1.0 spike. Settles the three facts PLAN.md marks UNVERIFIED:
//   1. Revolut-Api-Version 2026-04-20 is accepted (spec permits it; public changelog stops at 2026-03-12)
//   2. ORDER_COMPLETED carries merchant_order_ext_ref (optional in the webhook schema)
//   3. A real signature verifies against the exact raw bytes received
import http from "node:http"
import { verify } from "./verify.mjs"

const API_VERSION = process.env.REVOLUT_API_VERSION ?? "2026-04-20"
const KEY = process.env.REVOLUT_SECRET_KEY
const BASE = "https://sandbox-merchant.revolut.com"

const minor = (amount, currency) => {
  const d = new Intl.NumberFormat("en", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits
  return Math.round(amount * 10 ** d)
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Authorization": `Bearer ${KEY}`,
      "Revolut-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: body && JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text && JSON.parse(text) }
}

async function create() {
  const sessionId = "payses_spike_" + Date.now()
  const { status, body } = await api("/api/orders", {
    method: "POST",
    body: {
      amount: minor(12.34, "GBP"),
      currency: "GBP",
      capture_mode: "automatic",
      merchant_order_data: { reference: sessionId },   // returns as merchant_order_ext_ref
      redirect_url: process.env.REVOLUT_RETURN_URL ?? "https://example.com/return",
      expire_pending_after: "PT30M",
    },
  })

  console.log(`\n[1] POST /api/orders with Revolut-Api-Version: ${API_VERSION}`)
  console.log(`    HTTP ${status} -> ${status === 201 ? "ACCEPTED" : "REJECTED"}`)
  if (status !== 201) return console.error("    body:", JSON.stringify(body, null, 2))

  console.log(`    order id : ${body.id}`)
  console.log(`    token    : ${body.token}`)
  console.log(`    state    : ${body.state}`)
  console.log(`    ext ref  : ${body.merchant_order_data?.reference}`)
  console.log(`\n    Pay it here, then watch the listener:\n    ${body.checkout_url}\n`)
}

function listen() {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET
  const port = Number(process.env.PORT ?? 4000)

  http.createServer((req, res) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8")   // exact bytes, never re-serialized
      const result = verify(raw, req.headers, secret)
      const event = JSON.parse(raw)

      console.log(`\n[2] ${event.event}  order=${event.order_id}`)
      console.log(`    signature      : ${result.ok ? "VERIFIED" : "FAILED - " + result.reason}`)
      console.log(`    ext ref present: ${"merchant_order_ext_ref" in event ? "YES -> " + event.merchant_order_ext_ref : "NO (must retrieve the order)"}`)
      console.log(`    amount present : ${"amount" in event ? "YES" : "NO (must retrieve the order)"}`)
      console.log(`    raw: ${raw}`)

      res.writeHead(200).end()
    })
  }).listen(port, () => {
    console.log(`listening on :${port} — expose it with a tunnel and register that URL as the Revolut webhook`)
  })
}

if (!KEY && process.argv[2] !== "listen") {
  console.error("set REVOLUT_SECRET_KEY (sandbox). see README.md")
  process.exit(1)
}
process.argv[2] === "listen" ? listen() : create()
