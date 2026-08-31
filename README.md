# medusa-payment-revolut

An **unofficial** Revolut Merchant API payment provider for [Medusa v2](https://medusajs.com).

Hosted checkout, automatic capture, signed webhooks. No runtime dependencies.

> **Not affiliated with, endorsed by, or supported by Revolut or Medusa.** "Revolut" and "Medusa" are
> trademarks of their respective owners and are used here only to describe what this software is compatible
> with. This project ships no Revolut branding or logos.

> **Status: v1.0.0, unpublished and not yet used in production.** The full flow is verified against a live
> Medusa 2.19.0 instance and against **real Revolut Sandbox**, including genuinely Revolut-signed webhooks
> from real card payments. It has not yet run against production Revolut or served a real customer.
> Read [Limitations](#limitations) before pointing this at real money, and test in Sandbox first.

## Why this exists

There was no Revolut integration for any modern headless commerce platform — verified across Medusa, Vendure,
Saleor, Sylius, Spree, Solidus and Bagisto. Revolut officially supports six no-code platforms (WooCommerce,
Magento 2, PrestaShop, Shopify, BigCommerce, OpenCart) and no headless ones.

## Install

```bash
npm install medusa-payment-revolut
```

Requires Medusa `2.19.0` and Node 20+.

## Configure

```ts
// medusa-config.ts
module.exports = defineConfig({
  // Required. Medusa registers plugin API routes only from this list, and the webhook
  // endpoint lives there. Configuring the provider alone leaves /hooks/revolut unrouted.
  plugins: ["medusa-payment-revolut"],
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-revolut/providers/revolut",
            id: "revolut",
            options: {
              apiKey: process.env.REVOLUT_SECRET_KEY,        // sk_...
              webhookSecret: process.env.REVOLUT_WEBHOOK_SECRET, // wsk_...
              redirectUrl: process.env.REVOLUT_RETURN_URL,
              sandbox: process.env.NODE_ENV !== "production",
            },
          },
        ],
      },
    },
  ],
})
```

All three secrets are required — the provider refuses to start without them. This flow cannot complete an
order without webhooks, so a missing `webhookSecret` would mean money taken with no order.

Then:

1. **Enable the provider per region** in Admin. Registration alone does not expose it at checkout.
2. **Register the webhook** for `ORDER_COMPLETED` at `POST https://your-store.com/hooks/revolut`
   and store the returned `wsk_` secret.

### Why not the built-in `/hooks/payment/revolut_revolut`?

The plugin ships its own route because Medusa's built-in one acknowledges with HTTP 200 and hands the event to
the event bus. The local bus wraps subscribers in a `try/catch` that only logs, and the Redis bus swallows the
final failed attempt. Processing `ORDER_COMPLETED` requires a second call to Revolut, so any transient failure
there would lose a captured payment permanently — Revolut has the money, the Medusa order stays awaiting
payment, and Revolut never retries because it already received a 200.

`/hooks/revolut` does the same work synchronously and answers with a status Revolut can act on. Revolut retries
any error response three more times at ten-minute intervals and accepts anything in `200-399`, so:

| Status | When | Effect |
|---|---|---|
| `204` | invalid signature | logged and acknowledged; retrying can never make it valid |
| `503` | transient failure retrieving or processing the order | Revolut retries |
| `200` | payment recorded, or event not actionable | done |

## How the flow works

```
initiatePayment   no Revolut call — records session id, amount, currency
cart.complete     ├─ authorizePayment -> POST /api/orders  { id, token, checkout_url }
                  ├─ returns pending_authorization         (no Payment yet)
                  └─ order created, payment status "awaiting"
storefront        read checkout_url from the session, then redirect
customer pays on Revolut
webhook           POST /hooks/revolut -> verify HMAC -> retrieve order
Medusa            Payment created and captured on the existing order
```

**The Revolut order is created during cart completion, not at session initiation.** This is deliberate and is
the single most important property of the integration.

Medusa exposes payment-session data to the storefront as soon as a session is initiated. If the Revolut order
were created there, a payable `checkout_url` would exist *before* any Medusa order did — and a customer who
paid against a cart that then failed to complete would be charged with no order to show for it. Medusa's
`process-payment` workflow captures and then explicitly ignores permanent cart-completion failure
(`continueOnPermanentFailure: true`), and a `completed` Revolut order cannot be cancelled, so nothing
downstream can undo it.

Creating the order inside `authorizePayment` — which runs as part of cart completion — means a payable URL
cannot exist until an order does. It also means that when concurrent requests race and produce several payment
sessions, only the one that survives to completion ever becomes chargeable.

## Storefront

The default `nextjs-starter-medusa` has no provider UI registry, so it needs three small changes. A verified,
copy-pasteable integration is in [`examples/nextjs-starter/`](./examples/nextjs-starter) — it was applied to a
real checkout against a live backend and adds no type errors to the starter.

The one thing that matters: **complete the cart first, then read `checkout_url` and redirect.** The URL does
not exist before completion, which is the opposite order to Stripe. Reversing it reintroduces the exact bug
this design prevents.

Two non-obvious details the example handles:

- `cart.complete` returns `payment_collections` but not `payment_sessions`; the order must be refetched.
- That refetch needs `fields: "*payment_collections.payment_sessions"`. Asking only for `.data` omits
  `provider_id`, leaving no way to identify the Revolut session.

No change is needed to the payment step itself — `initiatePayment` returns status `pending`, which is what the
stock starter already filters for.

## Limitations

| Not supported | Why |
|---|---|
| **Refunds** | `refundPayment` throws. Revolut accepts refunds asynchronously, and Medusa deletes its Refund record when the provider throws — a retry generates a new refund id, which is also the idempotency key, so an ambiguous failure could refund twice. Refund from the Revolut dashboard. Tracked for v1.1.0. |
| **Manual / partial capture** | `CapturePaymentInput` carries no amount, so the provider cannot know how much to capture. Revolut treats an omitted amount as *capture everything* and voids the remainder, so a £40 partial capture against a £100 authorization would charge £100. Needs a Medusa core change. |
| Subscriptions, saved cards, disputes, Pay by Bank, terminals | Out of scope. |

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

`spike/` holds the v0.1.0 Sandbox probe used to verify the API's real behaviour before this was written.
`PLAN.md` records the versioned plan and the defects each review pass found.

## License

MIT
