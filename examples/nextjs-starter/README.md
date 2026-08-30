# Wiring `nextjs-starter-medusa`

Verified against `medusajs/nextjs-starter-medusa` (Next.js 15.3) and Medusa 2.19.0. Adds no type errors
to the starter.

The starter has no provider UI registry, so three files change. **The ordering matters more than the code**:
`cart.complete` runs *first*, and only then does a `checkout_url` exist. This is the opposite of Stripe, and
getting it backwards reintroduces the bug the plugin is designed to prevent — a customer paying for a cart
that never becomes an order.

## 1. `src/lib/constants.tsx`

Add the provider to `paymentInfoMap` and a matcher:

```tsx
export const paymentInfoMap = {
  // ...
  pp_revolut_revolut: {
    title: "Card via Revolut",
    icon: <CreditCard />,
  },
}

export const isRevolut = (providerId?: string) => {
  return providerId?.startsWith("pp_revolut")
}
```

No change is needed to the payment step itself: the plugin's `initiatePayment` returns status `pending`,
which is exactly what the starter filters for.

## 2. `src/lib/data/cart.ts`

Add `placeRevolutOrder` — see [`place-revolut-order.ts`](./place-revolut-order.ts).

Two things are easy to get wrong:

- `cart.complete` returns `payment_collections` but **not** `payment_sessions`, so the order must be refetched
  to read the URL.
- The refetch must use `fields: "*payment_collections.payment_sessions"`. Requesting only
  `+payment_collections.payment_sessions.data` omits `provider_id`, so you cannot tell which session is
  Revolut's.

## 3. `src/modules/checkout/components/payment-button/index.tsx`

Add a case and the button — see [`revolut-payment-button.tsx`](./revolut-payment-button.tsx):

```tsx
import { isManual, isRevolut, isStripeLike } from "@lib/constants"
import { placeOrder, placeRevolutOrder } from "@lib/data/cart"

// inside the switch, before the default:
case isRevolut(paymentSession?.provider_id):
  return <RevolutPaymentButton notReady={notReady} data-testid={dataTestId} />
```

`next/navigation`'s `redirect()` throws by design, so the handler must rethrow anything whose `digest`
starts with `NEXT_REDIRECT` rather than showing it as an error.

## Return page

The customer comes back to `redirectUrl` from the plugin options. Do **not** treat arriving there as proof of
payment — re-read the order. The webhook is what confirms it, and it may land before or after the redirect.

## Verified flow

```
session initiated        status "pending", no checkout_url
cart.complete            order created, Revolut order created, status pending_authorization
refetch order            checkout_url present
redirect                 customer pays at Revolut
webhook                  payment captured against the existing order
```
