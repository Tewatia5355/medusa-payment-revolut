# Revolut Merchant API brief for a headless payment integration

**Source snapshot:** Merchant OpenAPI `2026-04-20`, repository commit `714395e048f263898e9ccff9545a5b799a0194fa`; Checkout SDK commit `639a9182801e4693a9954f3fdc07ae97647aa839`; examples commit `de907bdd8cbe049d521e11b977c5acdacccddd24`.

## Recommended integration shape

For an ordinary one-off payment:

1. Backend creates a Revolut order.
2. Backend stores both returned `id` and `token`.
3. Browser either:
   - redirects to `checkout_url`, or
   - gives `token` to `@revolut/checkout`.
4. Revolut's hosted UI/widget collects the payment details and creates payment attempts.
5. Backend processes signed webhooks and retrieves the order by permanent `id`.
6. If manual capture was selected, backend captures after `ORDER_AUTHORISED`.
7. Backend cancels uncaptured orders or creates refund orders as needed.

Do **not** use `POST /api/orders/{order_id}/payments` for normal first-time card checkout: that endpoint is for charging an already saved payment method. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:1039-1076`

---

## 1. Authentication, environments, and versioning

### Server authentication

```http
Authorization: Bearer <MERCHANT_SECRET_API_KEY>
Revolut-Api-Version: 2026-04-20
Content-Type: application/json
```

The Merchant API uses the Merchant **Secret API key** as an HTTP Bearer token. The **Public key** is for supported browser-side payment modules; it is not a substitute for the Secret key. Direct Merchant API integrations use API keys, not OAuth. OAuth is mentioned only as an option for some no-code plugins. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6218-6232`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6255-6269`, [Get started](https://developer.revolut.com/docs/guides/merchant/get-started.md)

### Base URLs

| Environment | Base URL |
|---|---|
| Production | `https://merchant.revolut.com` |
| Sandbox | `https://sandbox-merchant.revolut.com` |

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:48-52`

Sandbox and Production are completely separate accounts and credentials. Apple Pay is not available in Sandbox. [Sandbox setup](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox.md)

### API versioning

Versioning is sent through:

```http
Revolut-Api-Version: YYYY-MM-DD
```

The latest checked OpenAPI spec is `2026-04-20`; its allowed values are:

```text
2023-09-01
2024-05-01
2024-09-01
2025-10-16
2025-12-04
2026-03-12
2026-04-20
```

Most current order operations require the header. Cancel currently marks it optional, but an omitted optional header defaults to the earliest supported version, so a new integration should send it consistently on every call. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:23-36`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6271-6295`, [API versions](https://developer.revolut.com/docs/guides/merchant/reference/versioning/api-versions.md)

**Documentation discrepancy:** the machine-readable repository contains and permits `2026-04-20`, but the public changelog currently stops at `2026-03-12`. Test `2026-04-20` in Sandbox before production rollout. [Merchant changelog](https://developer.revolut.com/docs/guides/merchant/reference/versioning/changelog.md)

Legacy path-versioned endpoints such as `/api/1.0/orders` are explicitly marked deprecated. Do not build a new integration against them. `Revolut-Engineering/revolut-openapi:yaml/merchant-1.0.yaml:42-68`

---

## 2. Order/payment REST flow

### Create an order

```http
POST /api/orders
```

Minimum request:

```json
{
  "amount": 500,
  "currency": "GBP"
}
```

Important optional fields:

```ts
{
  settlement_currency?: string
  description?: string
  customer?: object
  enforce_challenge?: "automatic" | "forced"
  line_items?: object[]
  shipping?: object
  capture_mode?: "automatic" | "manual"
  authorisation_type?: "final" | "pre_authorisation"
  cancel_authorised_after?: string // ISO-8601 duration
  expire_pending_after?: string    // ISO-8601 duration
  location_id?: string
  metadata?: Record<string, string>
  industry_data?: object
  merchant_order_data?: {
    reference?: string
    url?: string
  }
  redirect_url?: string
  statement_descriptor_suffix?: string
}
```

Only `amount` and `currency` are schema-required. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:54-155`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:8494-8539`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:14506-14535`

Response: `201 Created`, returning an `Order`. Important fields are:

```json
{
  "id": "6516e61c-d279-a454-a837-bc52ce55ed49",
  "token": "0adc0e3c-ab44-4f33-bcc0-534ded7354ce",
  "type": "payment",
  "state": "pending",
  "created_at": "2023-09-29T14:58:36.079398Z",
  "updated_at": "2023-09-29T14:58:36.079398Z",
  "amount": 500,
  "currency": "GBP",
  "outstanding_amount": 500,
  "capture_mode": "automatic",
  "authorisation_type": "final",
  "checkout_url": "https://checkout.revolut.com/payment-link/...",
  "enforce_challenge": "automatic"
}
```

`id` is the permanent server-side identifier. `token` is the temporary public identifier used by the browser widget and expires when the payment is authorised. Store both. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6776-6792`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9453-9503`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:14895-14910`

### Complete the payment

There is no normal server-side “submit card” REST call. Use either:

```text
order.checkout_url
```

or initialize the browser widget with:

```ts
RevolutCheckout(order.token, "prod")
```

The widget handles card collection, 3DS, redirects, and creation of the payment attempt. [Card pop-up flow](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/card-payments/web/pop-up.md), [Hosted Checkout API](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/api.md)

### Retrieve the authoritative state

```http
GET /api/orders/{order_id}
```

`order_id` is the permanent `id`, not the public `token`. Response is `200` with the same `Order` shape, including `payments[]`; each payment contains fields such as `id`, `state`, `amount`, `currency`, timestamps, payment method, authentication challenge, and decline reason. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:297-383`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9326-9375`

### Capture

```http
POST /api/orders/{order_id}/capture
```

Optional body:

```json
{
  "amount": 400,
  "line_items": []
}
```

- Omit `amount` for a full capture.
- A lower amount performs a partial capture.
- The uncaptured remainder is voided.
- An order can only be captured once.
- Repeating the same amount returns the current order; repeating with a different amount returns an error.
- Response: `200` with an `Order`.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:650-756`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:702-738`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9599-9625`

### Cancel / void

```http
POST /api/orders/{order_id}/cancel
```

No body. Cancellation is allowed only while the order is:

- `pending`, or
- `authorised` and not captured.

Response: `200` with the order in `cancelled` state. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:820-847`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:15836-15851`

### Refund

```http
POST /api/orders/{order_id}/refund
Idempotency-Key: <unique-value>
```

Request:

```json
{
  "amount": 100,
  "currency": "GBP",
  "description": "Refund for returned item",
  "merchant_order_data": {
    "reference": "refund-123"
  },
  "metadata": {
    "reason": "returned"
  }
}
```

`amount` and `currency` are required; currency must match the original order. A refund:

- is allowed only for a `completed` order;
- creates a separate order with `type: "refund"`;
- sets `related_order_id` to the original order;
- may be full or partial;
- may be repeated as multiple partial refunds, provided their total does not exceed the captured amount.

The immediate response is `201`; the documented example is initially `state: "processing"` with a payment in `refund_validated`, so do not assume the refund is complete merely because the HTTP request succeeded. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:927-972`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9626-9667`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:16338-16375`

---

## 3. Exact states and transitions

### Order states

```text
pending
processing
authorised
completed
cancelled
failed
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6750-6775`

Documented transitions:

```text
create                         → pending
pending + payment starts       → processing
processing + payment succeeds  → authorised
processing + attempt fails     → pending
authorised + capture succeeds  → completed
pending + API cancellation     → cancelled
authorised + cancellation      → cancelled
pending + expire_pending_after → failed
```

A failed or declined **payment attempt** normally returns the order to `pending`, allowing another attempt; it does not necessarily make the order `failed`. Once a successful payment completes, further attempts are disallowed. [Order lifecycle](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle.md)

Two expiry paths are documented:

- `cancel_authorised_after` expiry: `authorised → cancelled`.
- Card/network `capture_deadline` failure, where no partial capture occurred: lifecycle documentation says `authorised → pending`.

These are distinct mechanisms, although some surrounding prose loosely describes all authorisation expiry as cancellation. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:675-686`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:7579-7624`, [Order lifecycle](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle.md)

### Payment states

Exact enum:

```text
pending
authentication_challenge
authentication_verified
authorisation_started
authorisation_passed
authorised
capture_started
captured
refund_validated
refund_started
cancellation_started
declining
completing
cancelling
failing
completed
declined
soft_declined
cancelled
failed
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:8552-8576`

Main documented flows:

```text
pending
  ├─ authorisation_started → authorisation_passed → authorised
  ├─ authentication_challenge
  │    ├─ authentication_verified
  │    │    → authorisation_started
  │    │    → authorisation_passed
  │    │    → authorised
  │    ├─ failing → failed
  │    └─ authentication_verified → authorisation_started
  │         → declining → declined
  └─ declining → declined

authorised
  ├─ capture_started → captured → completing → completed
  └─ cancellation_started → cancelling → cancelled
```

The lifecycle guide calls the transition states short-lived and says business decisions should use result states, not intermediate states. It does not publicly document where `soft_declined`, `refund_validated`, or `refund_started` sit in a complete state diagram. Their exact transitions are therefore **NOT DOCUMENTED**. [Order lifecycle](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle.md)

**Documentation inconsistency:** the order enum describes `completed` as “captured and settled”, but the lifecycle moves the order to `completed` when its payment becomes `captured`; the payment may only later move from `captured` to `completed` when settled. The capture response example also shows order `completed` while its payment is still `captured`. Treat order `completed` as the payment-success terminal state, not proof that settlement accounting has finished. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6756-6763`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:15709-15726`

---

## 4. Automatic versus manual capture

On order creation:

```json
{
  "capture_mode": "automatic"
}
```

or:

```json
{
  "capture_mode": "manual",
  "authorisation_type": "final",
  "cancel_authorised_after": "P7D"
}
```

- `automatic` is the default and captures after authorisation.
- `manual` leaves the order in `authorised` until capture/cancel/expiry.
- `authorisation_type` defaults to `final`.
- `pre_authorisation` requires `capture_mode: "manual"`.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6833-6850`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6865-6890`

### Authorisation windows

- Final authorisation: maximum configured `cancel_authorised_after` is `P7D`.
- Pre-authorisation: maximum is `P30D`.
- Actual capture deadline is the earlier of the configured period and the card/network clearing window.
- `capture_deadline` is determined when the order becomes authorised.
- Pre-authorisation supports only cards, Apple Pay, and Google Pay. Revolut Pay account-to-account, Pay by Bank, and SEPA Direct Debit are not supported.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:75-89`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:675-686`

### Partial operations

| Operation | Supported? | Important constraint |
|---|---:|---|
| Partial capture | Yes | One capture only; remainder is voided |
| Multiple captures | No | Capture can happen only once |
| Partial refund | Yes | Multiple partial refunds allowed |
| Multiple partial refunds | Yes | Sum cannot exceed original captured amount |

---

## 5. Browser-side integration

### Package

```bash
npm install @revolut/checkout
```

Current npm/repository version checked: **`1.1.25`**. `Revolut-Engineering/revolut-checkout:package.json:1-16`, [npm package](https://www.npmjs.com/package/@revolut/checkout)

The package is mostly a typed loader. It downloads Revolut-hosted `version.js` and the versioned `embed.js` at runtime from the selected environment; it is not a Node Merchant REST SDK. `Revolut-Engineering/revolut-checkout:src/loader.ts:27-64`, `Revolut-Engineering/revolut-checkout:src/constants.ts:25-55`

### Browser credentials/identifiers

Two initialization styles exist:

1. **Token-based:** backend creates the order and browser receives `order.token`.

   ```ts
   const checkout = await RevolutCheckout(order.token, "prod")
   ```

2. **Payments/embedded modules:** browser receives the Merchant **Public API key**, while `createOrder()` calls your backend and returns:

   ```ts
   { publicId: order.token }
   ```

Never expose the Secret API key. `Revolut-Engineering/revolut-checkout:src/loader.ts:11-38`, `Revolut-Engineering/revolut-checkout:src/loader.ts:69-91`

The SDK source still uses the legacy label `public_id`/`publicId`; the current Merchant API response field is `token`.

### Available modes

| Mode | SDK entry point | Behaviour |
|---|---|---|
| Hosted Checkout Page | Redirect to `order.checkout_url` | Revolut-hosted unified checkout; no SDK required |
| Embedded Checkout | `RevolutCheckout.embeddedCheckout(...)` | Embedded unified UI for enabled Revolut Pay, card, Apple Pay, Google Pay, Pay by Bank, etc. |
| Card pop-up | `instance.payWithPopup(...)` | Full-screen/modal card form, including 3DS handling |
| Card field | `instance.createCardField(...)` | Card input embedded in merchant form |
| Revolut Pay | `RevolutCheckout.payments(...).revolutPay` | Mounted Revolut Pay button |
| Pay by Bank | `RevolutCheckout.payments(...).payByBank(...)` | Open Banking bank-selector modal |
| Apple/Google Pay | `paymentRequest(...)` | W3C Payment Request integration |

`Revolut-Engineering/revolut-checkout:src/types.ts:748-799`, [Embedded Checkout](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/embedded-checkout.md), [Revolut Pay](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/revolut-pay.md), [Pay by Bank](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/pay-by-bank.md)

The old direct `instance.revolutPay()` method is marked deprecated; use `RevolutCheckout.payments(...).revolutPay`. `Revolut-Engineering/revolut-checkout:src/types.ts:754-785`

### Lowest-effort choice

1. **Absolute least work:** redirect to returned `checkout_url`; no frontend payment SDK and Revolut renders all enabled payment methods.
2. **Least work while keeping checkout embedded:** `embeddedCheckout()`, because payment methods are aggregated and dashboard-configured.
3. **Least work for card-only:** `payWithPopup()`.

[Hosted Checkout API](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/api.md)

Client callbacks are UI signals, not authoritative payment proof. They may not fire because of browser closure, blockers, or network loss. Fulfil from a verified webhook and/or a server-side `GET /api/orders/{id}`. [Embedded Checkout callbacks](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/embedded-checkout.md)

---

## 6. Webhooks

### Registration

```http
POST /api/webhooks
```

```json
{
  "url": "https://shop.example.com/webhooks/revolut",
  "events": ["ORDER_COMPLETED", "ORDER_AUTHORISED"]
}
```

Response:

```json
{
  "id": "...",
  "url": "...",
  "events": ["ORDER_COMPLETED", "ORDER_AUTHORISED"],
  "signing_secret": "..."
}
```

Current responses include `signing_secret`, not only the creation response. Maximum registered webhook URLs: **10**. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:4672-4706`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:13707-13756`

### Exact event names

**Order**

```text
ORDER_COMPLETED
ORDER_AUTHORISED
ORDER_CANCELLED
ORDER_FAILED
ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED
ORDER_INCREMENTAL_AUTHORISATION_DECLINED
ORDER_INCREMENTAL_AUTHORISATION_FAILED
```

**Payment**

```text
ORDER_PAYMENT_AUTHENTICATION_CHALLENGED
ORDER_PAYMENT_AUTHENTICATED
ORDER_PAYMENT_AUTHORISATION_STARTED
ORDER_PAYMENT_DECLINED
ORDER_PAYMENT_FAILED
```

**Subscription**

```text
SUBSCRIPTION_INITIATED
SUBSCRIPTION_FINISHED
SUBSCRIPTION_CANCELLED
SUBSCRIPTION_OVERDUE
```

**Payout**

```text
PAYOUT_INITIATED
PAYOUT_COMPLETED
PAYOUT_FAILED
```

**Dispute**

```text
DISPUTE_ACTION_REQUIRED
DISPUTE_UNDER_REVIEW
DISPUTE_WON
DISPUTE_LOST
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:13664-13706`

There are no dedicated `REFUND_*` events in the published enum. Whether refund orders always emit the normal order events is **NOT DOCUMENTED** explicitly.

### Payload shapes

Order and payment events:

```ts
{
  event: WebhookEvent
  order_id: string
  merchant_order_ext_ref?: string
  incremental_authorisation_ext_reference?: string
}
```

`merchant_order_ext_ref` contains the original `merchant_order_data.reference` value—note the field-name mismatch. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:14333-14354`

Other payloads:

```ts
// Subscription
{
  event: WebhookEvent
  subscription_id: string
  external_reference?: string
}

// Payout
{
  event: WebhookEvent
  payout_id: string
}

// Dispute
{
  event: WebhookEvent
  dispute_id: string
}
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:14355-14399`

There is no webhook delivery/event ID in the documented payload. A provider must therefore tolerate duplicate deliveries and reconcile against the current API resource state.

### Signature verification

Headers:

```http
Revolut-Request-Timestamp: 1683650202360
Revolut-Signature: v1=<hexadecimal-HMAC>
```

During secret rotation, `Revolut-Signature` can contain multiple comma-separated signatures:

```http
Revolut-Signature: v1=<old-signature>,v1=<new-signature>
```

Algorithm:

```text
payload_to_sign =
  "v1" + "." +
  Revolut-Request-Timestamp + "." +
  raw_request_body

expected =
  "v1=" + HEX(HMAC-SHA256(
    key = webhook_signing_secret,
    message = payload_to_sign
  ))
```

Verification requirements:

1. Read the body as raw bytes before JSON parsing.
2. Require a supported signature version (`v1`).
3. Check `Revolut-Request-Timestamp` is within **5 minutes** of current UTC.
4. Compute HMAC-SHA256 using the webhook signing secret.
5. Compare against every comma-separated `v1=` signature.
6. Use a constant-time byte comparison.
7. Only then parse/process the event.
8. Retrieve the order server-side before fulfilment.

[Official signature guide](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature.md), `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6718-6741`, `Revolut-Engineering/revolut-checkout-example:card-field-example/server/helpers.js:1-90`

**Security-documentation ambiguity:** the guide says “raw webhook payload without whitespaces”, but immediately warns not to modify the body, and the official example captures `req.rawBody` before JSON parsing. Do **not** strip whitespace or JSON parse/re-serialize; sign the exact bytes delivered. `Revolut-Engineering/revolut-checkout-example:card-field-example/server/app.js:25-30`, `Revolut-Engineering/revolut-checkout-example:card-field-example/server/app.js:74-105`

### Delivery behaviour

- Events may arrive out of order; for example, `ORDER_COMPLETED` can arrive before a retried `ORDER_AUTHORISED`.
- Failed/timed-out deliveries are retried **3 more times**, each after **10 minutes**.
- Acknowledge with `204`; any `200–399` response is accepted.
- Production source IPs: `35.246.21.235`, `34.89.70.170`.
- Sandbox source IPs: `35.242.130.242`, `35.242.162.241`.

[Using webhooks](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/using-webhooks), `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6120-6140`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6204-6213`

---

## 7. Idempotency

Header:

```http
Idempotency-Key: <merchant-generated-unique-string>
```

The current OpenAPI uses it on:

| Endpoint | Requirement |
|---|---|
| `POST /api/orders/{order_id}/refund` | Optional |
| `POST /api/subscriptions` | Optional |
| `POST /api/subscription-usages` | Required |

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6388-6399`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6622-6633`

For the payment-provider scope:

- **Create order does not declare `Idempotency-Key`.**
- **Refund does; always send one.**
- **Capture does not declare the header**, but the operation itself is resource-idempotent: same amount returns current state, different amount errors.
- Idempotency-key retention duration and behaviour when the same key is reused with a different body are **NOT DOCUMENTED**.

---

## 8. Money representation and currencies

All Merchant API amounts are integer **minor currency units**:

```text
7034 EUR = €70.34
100 GBP  = £1.00
100 ISK  = ISK 100
```

Use the ISO 4217 exponent for each currency; do not use floating-point multiplication without explicit decimal rounding. Refund and capture amounts are also integer minor units. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6804-6814`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9599-9609`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9626-9639`

Additional constraints:

- Currency is an uppercase, three-character ISO 4217 code.
- Refund currency must equal the original order currency.
- If `line_items` are supplied, their `total_amount` sum must exactly equal the order `amount`.
- For non-zero card payments, the documented minimum is `$0.005` or equivalent using Revolut's exchange rate.

The OpenAPI does **not** expose a supported-currency enum. Revolut's Hosted Checkout guide says it accepts and settles in “25+ currencies”, but the exact set varies by payment method/account and is maintained in the live Help Centre. Therefore, an exact stable currency list is **NOT DOCUMENTED in the API specification** and should not be hardcoded. [Supported currencies](https://help.revolut.com/business/help/merchant-accounts/payments/in-which-currencies-can-i-accept-payments/), [Hosted Checkout introduction](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/introduction)

---

## 9. Constraints and implementation gotchas

- A production integration requires an approved Merchant account under a Revolut Business account and completion of KYM review. [Get started](https://developer.revolut.com/docs/guides/merchant/get-started.md)
- Exact supported merchant countries/regions are not enumerated in the API spec and are subject to the live eligibility page: **NOT DOCUMENTED as a stable API list**.
- Sandbox and Production accounts, keys, and data are completely separate. [Sandbox setup](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox.md)
- `token` is temporary/public; `id` is permanent/server-side. Store both.
- SDK callback `orderId` may actually mean the public order `token`, not the permanent API `id`. [Embedded Checkout](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/embedded-checkout.md)
- Failed payment-attempt webhooks do not mean the order is terminally failed; retrieve the order because the customer may retry.
- Webhook delivery order is not guaranteed.
- Webhook URLs cannot use `localhost` or a literal IP address and must include an `http` or `https` scheme. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:13650-13662`
- Pending-order expiry is configurable from `PT1M` through `PT720H`/30 days and can only be set at creation. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:7625-7641`
- Retail/physical-goods merchants are expected to send `line_items` and `shipping`; regulated/specialized industries have mandatory `industry_data`. Omitting required industry data may trigger scrutiny or risk controls. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:102-118`
- Numeric API rate limits, rate-limit headers, and formal retry quotas are **NOT DOCUMENTED** in the current Merchant OpenAPI.
- Legacy `/api/1.0/...` operations are deprecated; target the unversioned `/api/...` paths with the version header.
- The OpenAPI raw URL uses the repository’s `master` branch, not `main`; the supplied `.../main/yaml/merchant-2026-04-20.yaml` URL currently returns 404.

[Message]
Correction + head start — I gave you a wrong URL in the brief.

The `revolut-openapi` repo's default branch is **`master`**, not `main`. The working raw URL is:
https://raw.githubusercontent.com/revolut-engineering/revolut-openapi/master/yaml/merchant-2026-04-20.yaml
(721,082 bytes — confirmed downloaded.)

I've already parsed the 67 operations out of it. The ones relevant to a Medusa payment provider:

```
POST    /api/orders
GET     /api/orders/{order_id}
PATCH   /api/orders/{order_id}
POST    /api/orders/{order_id}/capture
POST    /api/orders/{order_id}/cancel
POST    /api/orders/{order_id}/refund
POST    /api/orders/{order_id}/increment-authorisation
GET     /api/orders/{order_id}/payments
GET     /api/payments/{payment_id}
POST    /api/orders/{order_id}/payment-intents
GET     /api/payment-intents/{payment_intent_id}
POST    /api/payment-intents/{payment_intent_id}/cancel
POST    /api/webhooks
POST    /api/webhooks/{webhook_id}/rotate-signing-secret
GET     /api/customers/{customer_id}/payment-methods
```

So don't spend effort rediscovering the endpoint list — take it as given and go **deep on the semantics** instead. Priorities, in order:

1. **Exact enum values** for order `state` and payment `state` from the spec, and the transitions between them. Grep the YAML for the state schemas.
2. **`capture_mode`** on `POST /api/orders` — exact field name and allowed values (I believe automatic vs manual). Auth expiry window. Whether partial capture and partial refund are supported (check `amount` optionality on the capture/refund request bodies).
3. **Auth + versioning headers** — exact header names and value formats, from the spec's `securitySchemes` and any required header parameters. I specifically need the API-version header name/format.
4. **Webhook signature verification** — the exact algorithm. Header names, the exact string that gets signed, hash function, replay/tolerance window. Quote it verbatim; this is a security boundary and I will not accept a paraphrase.
5. **Idempotency** — header name and which endpoints honour it.
6. **Amounts** — minor units vs decimal, confirmed from the spec field descriptions.
7. **Client side** — what the server hands the browser (token/ID field name on the order-create response), and which `@revolut/checkout` mode is least work for a custom headless storefront.

Practical tip: the file is 721KB, so don't try to read it whole. Use `curl` then `grep -n` / `python3` to pull specific schema blocks by name, e.g. grep for `capture_mode`, `enum:` near state definitions, `securitySchemes`, `Revolut-Api-Version`, `Idempotency`.

Still flag anything where the OpenAPI spec disagrees with the prose docs at developer.revolut.com, and still say "NOT DOCUMENTED" rather than guessing.

[Response]
Confirmed: `revolut-openapi` uses **`master`**. The working source is:

`https://raw.githubusercontent.com/revolut-engineering/revolut-openapi/master/yaml/merchant-2026-04-20.yaml`

## 1. Exact order and payment states

### Order `state`

Exact enum:

```text
pending
processing
authorised
completed
cancelled
failed
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6750-6775`

Documented transitions:

```text
create order                         → pending
pending + payment starts             → processing
processing + authorisation succeeds  → authorised
processing + payment attempt fails   → pending
authorised + capture succeeds        → completed

pending + cancel                     → cancelled
authorised + cancel                  → cancelled
pending + expire_pending_after       → failed
```

A declined/failed **payment attempt** normally moves the order from `processing` back to `pending`, allowing another payment attempt. It does not make the order `failed`. `failed` is used when an unpaid pending order expires. [Order lifecycle](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle.md)

Authorisation expiry has two documented paths:

- `cancel_authorised_after` expiry: `authorised → cancelled`.
- Card/network `capture_deadline` failure with no partial capture: the lifecycle guide says `authorised → pending`.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:675-686`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:7579-7624`

### Payment `state`

Exact enum:

```text
pending
authentication_challenge
authentication_verified
authorisation_started
authorisation_passed
authorised
capture_started
captured
refund_validated
refund_started
cancellation_started
declining
completing
cancelling
failing
completed
declined
soft_declined
cancelled
failed
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:8552-8576`

Documented main flow:

```text
pending
  ├─ authorisation_started
  │    → authorisation_passed
  │    → authorised
  │
  ├─ authentication_challenge
  │    ├─ authentication_verified
  │    │    → authorisation_started
  │    │    → authorisation_passed
  │    │    → authorised
  │    ├─ failing → failed
  │    └─ authentication_verified
  │         → authorisation_started
  │         → declining
  │         → declined
  │
  └─ declining → declined

authorised
  ├─ capture_started → captured → completing → completed
  └─ cancellation_started → cancelling → cancelled
```

The prose lifecycle does not define exact transitions for `soft_declined`, `refund_validated`, or `refund_started`: **NOT DOCUMENTED**. [Order lifecycle](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle.md)

### Spec/prose inconsistency

The order-state schema describes `completed` as “captured and settled”, but:

- the lifecycle moves the order to `completed` when the payment becomes `captured`;
- the capture response example shows order `completed` while its payment remains `captured`;
- the payment subsequently moves from `captured` to `completed` when settlement finishes.

Therefore, treat order `completed` as the successful payment/capture terminal state, not proof that accounting settlement has completed. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6756-6763`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:15709-15726`

---

## 2. Capture mode, authorisation expiry, partial operations

### Order creation fields

```json
{
  "amount": 5000,
  "currency": "GBP",
  "capture_mode": "manual",
  "authorisation_type": "final",
  "cancel_authorised_after": "P7D"
}
```

Exact `capture_mode` values:

```text
automatic
manual
```

- Default: `automatic`.
- `automatic`: capture follows authorisation without another merchant request.
- `manual`: order remains `authorised` until capture, cancellation, or expiry.

Exact `authorisation_type` values:

```text
final
pre_authorisation
```

- Default: `final`.
- `pre_authorisation` requires `capture_mode: "manual"`.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6833-6850`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6865-6890`

### Authorisation expiry

| Type | Maximum `cancel_authorised_after` |
|---|---:|
| `final` | `P7D` — 7 days |
| `pre_authorisation` | `P30D` — 30 days |

The effective deadline is the earlier of:

1. `cancel_authorised_after`, and
2. the card/network clearing window.

The actual `capture_deadline` is set when the order becomes authorised and does not subsequently change. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:675-686`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:7579-7590`

Pre-authorisation supports only:

```text
card
Apple Pay
Google Pay
```

It does not support:

```text
Revolut Pay account-to-account
Pay by Bank
SEPA Direct Debit
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:75-89`

### Capture request

```http
POST /api/orders/{order_id}/capture
```

Schema:

```ts
{
  amount?: number
  line_items?: LineItem[]
}
```

Neither the request body nor `amount` is required.

- Omitted `amount` means full authorised amount.
- Lower `amount` means partial capture.
- Captured amount cannot exceed authorised amount.
- Zero capture is forbidden.
- Capture can happen only once.
- The uncaptured remainder is voided.
- Retrying the same capture amount returns current order state.
- Retrying with a different amount returns an error.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:702-738`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9599-9625`

### Refund request

```http
POST /api/orders/{order_id}/refund
```

Schema:

```ts
{
  amount: number
  currency: string
  merchant_order_data?: {
    reference?: string
  }
  metadata?: Record<string, string>
  description?: string
}
```

Unlike capture, `amount` and `currency` are required.

- Partial refunds are supported.
- Multiple partial refunds are supported.
- Combined refunds cannot exceed the original captured amount.
- Currency must match the original order.
- Refunds are only accepted for `completed` orders.
- Each refund creates a new order with `type: "refund"` and `related_order_id`.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:927-955`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9626-9667`

The immediate example response is a refund order in `processing` with payment state `refund_validated`; HTTP `201` is not proof the refund has completed. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:16354-16375`

---

## 3. Auth and versioning headers

### Server authentication

Exact format:

```http
Authorization: Bearer <Merchant API Secret key>
```

The spec says the Secret key “should be included in all request headers as a `Bearer` token.” Direct Merchant API integrations use this Secret key rather than OAuth. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6255-6269`

### API version

Exact header:

```http
Revolut-Api-Version: 2026-04-20
```

- Header name: `Revolut-Api-Version`
- Value format: `YYYY-MM-DD`
- Schema type: string
- Schema format: `date`
- Required endpoints return an error if omitted or unsupported.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:23-36`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6271-6295`

Current accepted enum in this specification:

```text
2023-09-01
2024-05-01
2024-09-01
2025-10-16
2025-12-04
2026-03-12
2026-04-20
```

For a new integration, pin:

```http
Revolut-Api-Version: 2026-04-20
```

The cancel endpoint currently references the optional version-header parameter; omitted optional headers default to the earliest version. Always sending the version avoids accidental legacy behaviour. `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:820-824`, [API versions](https://developer.revolut.com/docs/guides/merchant/reference/versioning/api-versions.md)

**Disagreement:** the OpenAPI repository contains and permits `2026-04-20`, while the prose changelog currently ends at `2026-03-12`. [Changelog](https://developer.revolut.com/docs/guides/merchant/reference/versioning/changelog.md)

### Base URLs

```text
Production: https://merchant.revolut.com
Sandbox:    https://sandbox-merchant.revolut.com
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:48-52`

---

## 4. Webhook signature verification — exact documented algorithm

Headers:

```http
Revolut-Request-Timestamp: 1683650202360
Revolut-Signature: v1=09a9989dd8d9282c1d34974fc730f5cbfc4f4296941247e90ae5256590a11e8c
```

During signing-secret rotation:

```http
Revolut-Signature: v1=<signature-1>,v1=<signature-2>
```

### Verbatim string-to-sign formula

> `payload_to_sign = {version}.{Revolut-Request-Timestamp}.{raw-payload}`

The documented example is:

```text
v1.1683650202360.{"event": "ORDER_COMPLETED","order_id": "9fc01989-3f61-4484-a5d9-ffe768531be9","merchant_order_ext_ref": "Test #3928"}
```

### Verbatim hash construction

The guide says:

> “Revolut uses the HMAC SHA-256 algorithm to sign its webhooks.”

And:

> “To compute the HMAC, use the SHA256 hash function and:
> - The signing secret for the webhook as the key
> - The payload to sign as the message”

The expected header value is:

```text
v1=<hexadecimal HMAC-SHA256 digest>
```

Equivalent construction:

```text
expected =
  "v1=" +
  hex(
    HMAC-SHA256(
      key = webhook_signing_secret,
      message =
        "v1." +
        Revolut-Request-Timestamp +
        "." +
        raw_request_body
    )
  )
```

### Replay window — verbatim

> “To validate the event, make sure that the `Revolut-Request-Timestamp` date-time is within a 5-minute time tolerance of the current universal time (UTC).”

[Official signature guide](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature.md)

Required implementation sequence:

```text
1. Capture raw body bytes before JSON parsing.
2. Read Revolut-Request-Timestamp.
3. Reject timestamps outside the 5-minute UTC tolerance.
4. Read every comma-separated Revolut-Signature entry.
5. Reject unsupported versions; currently v1.
6. Compute HMAC-SHA256 over:
   v1 + "." + timestamp + "." + exact raw body
7. Compare hexadecimal digests in constant time.
8. Accept if one active-secret/signature combination matches.
9. Parse JSON only after signature verification.
```

The official example implementation uses Node's:

```js
crypto
  .createHmac("sha256", signingSecret)
  .update(payloadToSign)
  .digest("hex")
```

and `crypto.timingSafeEqual`. `Revolut-Engineering/revolut-checkout-example:card-field-example/server/helpers.js:1-90`

### Security-documentation contradiction

The prose says:

> “The raw webhook payload without whitespaces”

but also says:

> “The signature is sensitive to any modifications … it is crucial not to alter the body”

The official example captures the raw request buffer before parsing. Therefore, do **not** strip whitespace or JSON parse/re-serialize. Sign the exact bytes received. `Revolut-Engineering/revolut-checkout-example:card-field-example/server/app.js:25-30`, `Revolut-Engineering/revolut-checkout-example:card-field-example/server/app.js:74-105`

---

## 5. Idempotency

Exact header:

```http
Idempotency-Key: <merchant-generated-unique-string>
```

The current spec attaches it to:

| Endpoint | Status |
|---|---|
| `POST /api/orders/{order_id}/refund` | Optional |
| `POST /api/subscriptions` | Optional |
| `POST /api/subscription-usages` | Required |

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6388-6399`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6622-6633`

For a payment provider:

- `POST /api/orders` does **not** declare `Idempotency-Key`.
- Refund does; use it on every refund request.
- Capture does not take the header but is operation-idempotent:
  - same amount after capture → current order;
  - different amount after capture → error.
- Idempotency-key retention duration is **NOT DOCUMENTED**.
- Behaviour when reusing a key with a changed body is **NOT DOCUMENTED**.

---

## 6. Amount representation

Order amount is:

```yaml
type: integer
```

The exact description says:

> “The order total expressed in minor currency units, according to the ISO 4217 standard. For example, `7034` in `EUR` corresponds to €70.34.”

Examples:

```text
7034 EUR = €70.34
100 GBP  = £1.00
100 ISK  = ISK 100
```

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6804-6814`

Capture:

> “Specify an amount to capture, in minor currency units.”

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9599-9609`

Refund:

> “The amount to be refunded, specified in the smallest currency unit (e.g., cents for USD, pence for GBP).”

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:9626-9639`

Gotchas:

- Use integers, never decimal API values.
- Use the ISO 4217 exponent; not every currency has two decimal places.
- `line_items[].total_amount` must sum exactly to the order `amount`.
- Refund currency must match the original order currency.
- The API schema does not publish a currency enum: the exact account/payment-method currency list is **NOT DOCUMENTED in OpenAPI**.

---

## 7. Browser token and least-work checkout mode

### What the server returns to the browser

Create-order response includes two distinct values:

```json
{
  "id": "6516e61c-d279-a454-a837-bc52ce55ed49",
  "token": "0adc0e3c-ab44-4f33-bcc0-534ded7354ce"
}
```

- `id`: permanent server-side order ID used by retrieve, capture, cancel, refund, and webhooks.
- `token`: temporary public order identifier used to initialize browser payment flows.
- The token expires when the payment is authorised.

`Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:6776-6792`, `Revolut-Engineering/revolut-openapi:yaml/merchant-2026-04-20.yaml:14895-14910`

The browser should receive `token`, never the Secret API key.

SDK documentation and types sometimes call the token `public_id`, `publicId`, or callback `orderId`. Those are legacy/client naming conventions for the API response’s `token`, not the permanent `id`.

### Package

```bash
npm install @revolut/checkout
```

Current version checked: `1.1.25`. `Revolut-Engineering/revolut-checkout:package.json:1-16`

### Least work

**Absolute least work:** skip the SDK and redirect to:

```ts
window.location.href = order.checkout_url
```

Revolut hosts the checkout and displays enabled payment methods. [Hosted Checkout API](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/api.md)

**Least work while keeping checkout inside the custom storefront:** use:

```ts
RevolutCheckout.embeddedCheckout({
  publicToken: REVOLUT_PUBLIC_API_KEY,
  mode: "prod",
  target,
  createOrder: async () => {
    const order = await backendCreateOrder()
    return { publicId: order.token }
  }
})
```

It aggregates enabled card, Revolut Pay, Apple Pay, Google Pay, Pay by Bank, and other methods in one dashboard-configured widget. [Embedded Checkout](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/embedded-checkout.md)

**Least work if card-only:** token initialization plus:

```ts
const { payWithPopup } = await RevolutCheckout(order.token, "prod")
payWithPopup({ /* callbacks/customer data */ })
```

This is less UI work than `createCardField()`. `Revolut-Engineering/revolut-checkout:src/types.ts:748-785`

Client success callbacks are not payment proof. Finalize only after a verified webhook and/or server-side retrieval of `GET /api/orders/{id}`.
