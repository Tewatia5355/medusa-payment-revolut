# medusa-payment-revolut

Revolut Merchant API payment provider for [Medusa v2](https://medusajs.com).

Hosted checkout, automatic capture, signed webhooks. No runtime dependencies.

> **Status: v1.0.0, unpublished.** Verified against live Revolut Sandbox with a real 3DS card payment.
> Not yet exercised in production.

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

`/hooks/revolut` does the same work synchronously and answers with a status Revolut can act on: `401` for an
invalid signature (permanent, stop), `503` for a transient failure (retry), `200` once the payment is recorded.

## How the flow works

```
initiatePayment   POST /api/orders            -> { id, token, checkout_url }
authorizePayment  returns pending_authorization           (no Payment yet)
cart.complete     order created, payment status "awaiting"
storefront        redirect to checkout_url
customer pays on Revolut
webhook           POST /hooks/revolut -> verify HMAC -> retrieve order
Medusa            Payment created and captured on the existing order
```

**The order is created before the customer pays.** This is deliberate. Redirecting first and completing the
cart afterwards hits `continueOnPermanentFailure: true` in Medusa's `process-payment` workflow, which keeps
the captured payment even when order creation fails — and a `completed` Revolut order cannot be cancelled.

## Storefront

The default `nextjs-starter-medusa` has no provider UI registry, so it needs three changes:

1. Add a `paymentInfoMap` entry for `pp_revolut_revolut`.
2. Call `cart.complete` **before** redirecting to `checkout_url`.
3. Handle sessions with status `pending_authorization`; the starter only looks for `pending`.

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
