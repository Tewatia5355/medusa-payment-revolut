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

async function create() {
  const sessionId = "payses_spike_" + Date.now()
  const res = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Revolut-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 1234, // minor units; v1.0.0 converts with MathBN, see PLAN.md 5.5
      currency: "GBP",
      capture_mode: "automatic",
      merchant_order_data: { reference: sessionId }, // returns as merchant_order_ext_ref
      redirect_url:
        process.env.REVOLUT_RETURN_URL ?? "https://example.com/return",
      expire_pending_after: "PT30M",
    }),
  })
  const body = await res.json()

  console.log(`\n[1] POST /api/orders with Revolut-Api-Version: ${API_VERSION}`)
  console.log(
    `    HTTP ${res.status} -> ${res.status === 201 ? "ACCEPTED" : "REJECTED"}`
  )
  if (res.status !== 201)
    return console.error("    body:", JSON.stringify(body, null, 2))

  console.log(`    order id : ${body.id}`)
  console.log(`    token    : ${body.token}`)
  console.log(`    state    : ${body.state}`)
  console.log(`    ext ref  : ${body.merchant_order_data?.reference}`)
  console.log(
    `\n    Pay it here, then watch the listener:\n    ${body.checkout_url}\n`
  )
}

function listen() {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET
  const port = Number(process.env.PORT ?? 4000)
  const MAX_BODY = 64 * 1024 // webhook payloads are tiny; refuse to buffer more than this

  // An empty or absent secret is a usable HMAC key, so every forged signature would verify.
  if (!secret) {
    console.error(
      "set REVOLUT_WEBHOOK_SECRET (wsk_...) — refusing to listen without it"
    )
    process.exit(1)
  }

  http
    .createServer((req, res) => {
      if (req.method !== "POST") return res.writeHead(200).end("ok") // health checks must not kill the listener

      const chunks = []
      let size = 0
      req.on("data", (c) => {
        size += c.length
        if (size > MAX_BODY) {
          res.writeHead(413).end()
          return req.destroy()
        }
        chunks.push(c)
      })

      req.on("end", () => {
        if (res.writableEnded) return
        const raw = Buffer.concat(chunks).toString("utf8") // exact bytes, never re-serialized

        // Nothing derived from the body may be parsed, logged or acted on before this passes.
        const result = verify(raw, req.headers, secret)
        if (!result.ok) {
          console.log(`\n[!] rejected unverified request: ${result.reason}`)
          return res.writeHead(401).end()
        }

        let event
        try {
          event = JSON.parse(raw)
        } catch {
          console.log(`\n[!] signed but non-JSON body (${raw.length} bytes)`)
          return res.writeHead(400).end()
        }
        if (
          event === null ||
          typeof event !== "object" ||
          Array.isArray(event)
        ) {
          console.log(`\n[!] signed but not a JSON object`)
          return res.writeHead(400).end()
        }

        console.log(`\n[2] ${event.event}  order=${event.order_id}`)
        console.log(`    signature      : VERIFIED`)
        console.log(
          `    ext ref present: ${"merchant_order_ext_ref" in event ? "YES -> " + event.merchant_order_ext_ref : "NO (must retrieve the order)"}`
        )
        console.log(
          `    amount present : ${"amount" in event ? "YES" : "NO (must retrieve the order)"}`
        )
        console.log(`    raw: ${raw}`)

        res.writeHead(200).end()
      })
    })
    .listen(port, () => {
      console.log(
        `listening on :${port} — expose it with a tunnel and register that URL as the Revolut webhook`
      )
    })
}

if (!KEY && process.argv[2] !== "listen") {
  console.error("set REVOLUT_SECRET_KEY (sandbox). see README.md")
  process.exit(1)
}
process.argv[2] === "listen" ? listen() : create()
