# `medusa-payment-revolut` — versioned delivery plan

**Baselines:** Medusa `v2.19.0` · Revolut Merchant OpenAPI `2026-04-20` · Node ≥20 (full ICU).
Three GPT-5.6 Sol review passes (2 correctness, 1 ponytail) + Medusa's own contribution guide.
Every decision cites source read directly, and as of 2026-08-30 the three previously **UNVERIFIED** facts are
confirmed against live Sandbox (§3, v0.1.0).

Supersedes `PLAN-v1/v2/v3.md`, which contained money bugs (§7).

---

## 1. Distribution — standalone npm plugin, not a core PR

Decided on evidence, not preference.

**Core ships exactly one payment provider.** `packages/modules/providers/` contains:

```
analytics-local, analytics-posthog, auth-emailpass, auth-github, auth-google, auth-oidc,
caching-redis, file-local, file-s3, fulfillment-manual, locking-postgres, locking-redis,
notification-local, notification-sendgrid, payment-stripe, search-postgres
```

`payment-stripe` and nothing else. Every community provider — Mollie, Mercado Pago, Pay.nl, PayMongo,
Wompi, Comgate, Peach, Woovi — lives in its own repo.

**`CONTRIBUTING.md` says a core PR would be rejected:**

> "Our core maintainers prioritize pull requests (PRs) from within our organization. External contributions
> are regularly triaged, but not at any fixed cadence."

> "If you… wish to work on more extensive features, please reach out to CODEOWNERS instead of directly
> submitting a PR with all the changes… especially if the PR is not accepted (**which will be the case if it
> does not align with our roadmap**)."

**Getting listed needs no PR at all.** From `plugins/create/page.mdx:66-80`:

> "Medusa scrapes NPM for a list of plugins that integrate third-party services… make sure to add the
> `medusa-v2` and `medusa-plugin-integration` keywords to the `keywords` field in `package.json`."

So the entire distribution path is: publish to npm with two keywords. No submission, no review queue, no
maintainer dependency.

```jsonc
{
  "name": "medusa-payment-revolut",
  "keywords": ["medusa-v2", "medusa-plugin-integration", "payment", "revolut"]
}
```

**Publish flow** (`plugins/create/page.mdx:274-294, 574-640`):

| Step | Command |
|---|---|
| local dev install | `npx medusa plugin:publish` |
| watch | `npx medusa plugin:develop` |
| release | `npx medusa plugin:build` → `npm publish` |
| update | `npm version <type>` → `plugin:build` → `npm publish` |

**Packaging constraint that drives versioning:** Medusa packages must appear in **both** `devDependencies`
and `peerDependencies`, pinned to a Medusa version (`page.mdx:194-230`), plus `@swc/core` as a devDep.
Plugins require Medusa **≥ 2.3.0**. Our peer range therefore ties releases to Medusa's release train — see §4.

---

## 2. Version roadmap

Each version ships one coherent capability and is independently useful. Nothing is scheduled that is
currently blocked.

| Version | Capability | Status |
|---|---|---|
| **v0.1.0** | Sandbox spike — settle the UNVERIFIED facts | ✅ **complete, gate passed** |
| **v1.0.0** | Hosted checkout, automatic capture, webhooks, cancel | ✅ **implemented**, typechecks and builds; needs production use |
| **v1.1.0** | Refunds with reconciliation | needs design (§3.3) |
| **v1.2.0** | Embedded checkout (`@revolut/checkout`) | optional, demand-driven |
| **v2.0.0** | Manual / partial capture | **blocked on Medusa core** (§5) |
| never | subscriptions, disputes, terminals | out of scope |

---

## 3. Version detail

### v0.1.0 — Spike — ✅ **COMPLETE, gate passed** (Sandbox, 2026-08-30)

Ran end-to-end against Revolut Sandbox with a real £12.34 card payment (3DS verified). All three questions
resolved; the gate is passed and v1.0.0 is unblocked.

| # | Question | Result |
|---|---|---|
| 1 | Is `Revolut-Api-Version: 2026-04-20` accepted? | ✅ **HTTP 201.** Live despite the public changelog stopping at `2026-03-12`. `2026-03-12` also works. Keep the pin. |
| 2 | Does `ORDER_COMPLETED` carry `merchant_order_ext_ref`? | ✅ **Yes**, on both `ORDER_AUTHORISED` and `ORDER_COMPLETED`. The correlation design in §4 holds. |
| 3 | Does a real signature verify over raw bytes? | ✅ **Verified** on every genuine delivery; the health-check probe correctly failed. |

Also confirmed live: `merchant_order_data.reference` round-trips; `?merchant_order_data_reference=` returns
exactly one match (so §5.3 orphan recovery works); `capture_mode: "automatic"` and
`expire_pending_after: "PT30M"` are accepted; order `state` on create is `pending`; amounts are minor units.

**Six things Sandbox revealed that the OpenAPI spec did not:**

1. **Duplicate webhook delivery was observed.** `ORDER_AUTHORISED` and `ORDER_COMPLETED` each arrived **twice**
   for a single payment, byte-identical, despite the listener returning HTTP 200 promptly. One run does not
   prove an at-least-once *guarantee*, and the cause is unconfirmed — retry, duplicate dispatch, or tunnel
   behaviour are all consistent with the observation. The design implication is the same either way:
   **handlers must be idempotent.** Medusa is protected — `capturePaymentWorkflow` returns early once
   `captured_at` is set (`payment-module.ts:789-790`) — but `getWebhookActionAndData` must stay
   side-effect-free and derive its result purely from the retrieved order.
2. **`ORDER_AUTHORISED` fires even under `capture_mode: "automatic"`.** The order really does pass through
   `authorised` on the way to `completed`. This empirically confirms §3: `authorised` must map to
   `pending_authorization`, and `ORDER_AUTHORISED → NOT_SUPPORTED`. Mapping it to `authorized` would expose a
   capturable Payment during the window and reopen the §5 partial-capture bug.
3. **`settled_amount` ≠ `amount`.** The completed order reported `amount: 1234` but
   `settled_amount: 1202`, with `fees: [{ type: "acquiring", amount: 32 }]`. `WebhookActionData.amount` **must**
   use the order `amount`, never `settled_amount` — otherwise every capture under-reports by the acquiring fee.
4. **Retrieved orders contain PII.** `payments[].payment_method.cardholder_name`, `payer.email`, card BIN, last
   four and expiry are all returned. **Do not persist the full order into `payment.data`** — §3's
   "return full order as `data`" is corrected: store only `id`, `state`, `amount`, `currency`, the reference,
   and `checkout_url`. `checkout_url` is **required** in the projection — `authorizePayment().data` replaces
   `PaymentSession.data`, so omitting it would strip the URL the storefront needs to redirect to. Never log the
   raw order.
5. **List responses are wrapped**: `GET /api/orders` returns `{ "orders": [...] }`, not a bare array. The §5.3
   recovery path must unwrap it.
6. **`signing_secret` is returned on webhook *create* but not on *list*.** The spec claims it is "included in
   all webhook responses" (`merchant.yaml:13717`) — that is wrong. Capture it at registration or rotate it.

**The spike also caught a bug in its own listener:** an empty-body request crashed the process through an
unguarded `JSON.parse`. In production any health probe or scanner would have killed webhook processing. Fixed;
v1.0.0's handler must tolerate non-JSON and non-POST input.

### v1.0.0 — Hosted checkout, automatic capture — ✅ implemented

Built as a publishable plugin: `src/providers/revolut/{index,service,webhook}.ts`, 14 jest tests, clean
`tsc --noEmit` against Medusa v2.19.0, and `medusa plugin:build` produces a loadable provider whose
`ModuleProvider` export exposes all 10 methods. `npm pack` is 10 files / 33KB with no dev files.

**Flow** (order created *before* the customer pays — see §7 for why):

```
initiatePayment       POST /api/orders            → { id, token, checkout_url }
authorizePayment      → pending_authorization                  (no Payment yet)
cart.complete         → order created, payment status "awaiting"
storefront            → redirect to checkout_url
customer pays
webhook ORDER_COMPLETED → verify HMAC → GET order → { session_id, amount }
core                  → Payment created + captured on the existing order
```

Medusa designed this path for exactly this case (`abstract.ts:227-236`):

> "For payment methods where authorization does not happen immediately (e.g. bank transfers, **payment
> links**, vouchers…), return `status: "pending_authorization"`… No `Payment` record will be created yet.
> The cart can still be completed and an order will be created with an 'awaiting' payment status."

**All 10 abstract methods** — mandatory, it will not compile with fewer (`grep -n "^  abstract "` on
`abstract-payment-provider.ts`):

| Method | Behaviour |
|---|---|
| `initiatePayment` | `POST /api/orders` + `merchant_order_data.reference`, `redirect_url`, `expire_pending_after: "PT30M"` |
| `authorizePayment` / `getPaymentStatus` / `retrievePayment` | `GET /api/orders/{id}` → map. Persist a **minimal projection** (`id`, `state`, `amount`, `currency`, reference, `checkout_url`) — never the full order, which carries PII |
| `capturePayment` | verify `completed`; **no capture call** |
| `cancelPayment` | `POST /api/orders/{id}/cancel` |
| `deletePayment` | cancel when an id is present, else no-op |
| `updatePayment` | `PATCH /api/orders/{id}` (amount editable only while `pending`) |
| `refundPayment` | **throws `MedusaError`** — deferred to v1.1.0 |
| `getWebhookActionAndData` | verify HMAC → retrieve order → map |

**State mapping** (automatic-capture variant):

| Revolut | → Medusa |
|---|---|
| `pending` / `processing` / `authorised` | `pending_authorization` |
| `completed` | `captured` |
| `cancelled` | `canceled` |
| `failed` | `error` |

`authorised` must **not** map to `authorized`: under automatic capture it is transient
(`processing → authorised → completed`), and exposing it as a capturable Payment reopens the §5 partial-capture
bug (`payment-module.ts:773-899`). Subscribe to `ORDER_COMPLETED` only; `ORDER_AUTHORISED → NOT_SUPPORTED`.

**Webhook security:**

```
expected = "v1=" + hex(HMAC_SHA256(
  key     = wsk_…,
  message = "v1." + Revolut-Request-Timestamp + "." + <exact raw body bytes>))
```

- ms timestamp; reject future values: `age >= 0 && age <= 300_000` (Revolut's own reference impl).
- Multiple comma-separated `v1=` values during rotation → accept if any matches.
- `crypto.timingSafeEqual`; reject unknown versions and malformed/odd-length hex.
- Sign raw bytes — no whitespace stripping, no re-serialization.
- Medusa preserves raw bytes (`preserveRawBody: true`) and rehydrates the Buffer (`subscriber.ts:28-34`).
- Verify before any use of `payload.data` or any side effect — *not* "before parsing": Medusa parses,
  enqueues and returns 200 before the provider runs (`hooks/payment/[provider]/route.ts:14-37`).

URL: `POST /hooks/payment/revolut_revolut` — no `pp_` prefix, the module prepends it.

**Money:** both directions. `toMinor` outbound, `fromMinor` for webhook/retrieved amounts (Stripe converts
inbound too, `stripe-base.ts:719-779`). `getSmallestUnit` is **not** exported from `@medusajs/framework/utils`
— it exists only inside provider packages. Use `Intl` instead, verified on Node v20.20.0 against Stripe's
hardcoded list, all 13 special-case currencies match:

```ts
const digits = (c: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits
```

**Ships:** 3 files (`index.ts`, `service.ts`, `__tests__/webhook.spec.ts`), ~300 LOC, **zero new runtime
dependencies** (native `fetch`, `node:crypto`, `Intl`).

**Does not ship:** storefront code. `nextjs-starter-medusa` has no provider UI registry — `paymentInfoMap`,
`isStripeLike`/`isManual` and the `PaymentButton` switch are hardcoded, and it selects the active session by
`status === "pending"` while ours is `pending_authorization`. That is consumer-side work; v1.0.0 ships a
documented README recipe instead of pretending otherwise.

**Config** — `validateOptions()` throws on any missing value (Stripe only warns at `stripe-base.ts:69-87`,
but this flow cannot complete an order without webhooks, so a warning would ship a silent
money-taken/no-order failure):

```ts
{ apiKey, webhookSecret, redirectUrl, sandbox }   // all four required except sandbox
```

### v1.1.0 — Refunds

Deferred from v1.0.0 because the failure mode is a **double refund**, not an inconvenience:

`POST /refund` returns 201 while still `processing` (`merchant.yaml:16354-16375`). If the call fails
ambiguously *after* Revolut accepted it, Medusa **deletes its Refund record** (`payment-module.ts:941-948`);
a retry creates a new refund id — and that id *is* the idempotency key (`:1037-1067`). So the retry is a
second, non-idempotent refund.

Ship when there is durable reconciliation: persist the Revolut refund order id keyed on something that
survives Medusa deleting and recreating the Refund record, and poll to a terminal state. Until then
`refundPayment` throws and the README says refund from the Revolut dashboard.

### v1.2.0 — Embedded checkout

`RevolutCheckout.embeddedCheckout()` keeps checkout in-storefront. Adds `@revolut/checkout` (`1.1.25`), a
public-key option, and in-page card handling. Zero functional gain over the redirect — build only if the
redirect is actually complained about.

### v2.0.0 — Manual / partial capture — blocked upstream (§5)

---

## 4. Version and compatibility policy

- **SemVer**, driven by the peer range. Because Medusa packages are pinned in `peerDependencies`, a Medusa
  major/minor that changes the provider contract forces a plugin **minor** bump; a breaking change in our own
  option shape forces a **major**.
- Declare `peerDependencies` against the Medusa version actually tested — start at the current `2.19.x`, not a
  speculative range.
- Pin `Revolut-Api-Version: 2026-04-20` as a constant in code, never an option. The header is **required** on
  these endpoints (`merchant.yaml:6250-6285`). Bumping it is a deliberate, tested plugin release.
- Every release: `npm version <type>` → `npx medusa plugin:build` → `npm publish`.

---

## 5. The one legitimate upstream contribution

`CapturePaymentInput` carries no amount (`provider.ts@v2.19.0:142`):

```ts
export interface CapturePaymentInput extends PaymentProviderInput {}          // empty
export interface RefundPaymentInput  extends PaymentProviderInput { amount: BigNumberInput }
```

Revolut treats an omitted capture amount as *capture everything* and **voids the remainder**
(`merchant.yaml:702-738`). So a £40 partial capture against a £100 authorization charges £100, voids £60, and
leaves Medusa's ledger reading £40. No provider-side workaround exists — the amount simply never arrives.

This is the only part of the problem that belongs in core, and there is prior art: **#14984** "Order edit
cancels payment authorization instead of allowing partial capture" and **#16012** "Check-then-act races bypass
amount guards in payment capture/refund".

Per `CONTRIBUTING.md`, the correct sequence is **not** a PR:

1. Open an **issue** first — "Issues before PRs… make sure that there is an issue for what you will be working on."
2. Reach out to **CODEOWNERS** for anything extensive.
3. Only then branch from `develop` with a `feat/` prefix, add a **changeset**, and include unit + integration
   tests. PRs are squash-merged; PR body must use the **What / Why / How / Testing** structure.

Expect slow triage — external PRs are explicitly not on a fixed cadence.

**Precedent to calibrate against:** issue **#11609** ("`getWebhookActionAndData` doesn't work with action
`canceled`") was closed **`not_planned`** on 2025-04-06. Medusa deliberately does not process `canceled`
webhooks — confirmed still true in v2.19.0 source, where the subscriber early-returns on `CANCELED`, `FAILED`,
`REQUIRES_MORE`, `PENDING_AUTHORIZATION` and `PENDING`. So v1.0.0 must never depend on those events, and a
core proposal here may equally be declined.

---

## 6. Build sequence for v1.0.0

1. `service.ts` skeleton — auth, pinned version header, `toMinor`/`fromMinor`
2. `initiatePayment` / `authorizePayment` (→ `pending_authorization`) / `getPaymentStatus` / `retrievePayment`
3. Signature verification **and its tests**, before any action is wired
4. `getWebhookActionAndData` — verify → retrieve order → map
5. `cancelPayment` / `deletePayment` / `capturePayment` / `updatePayment` / `refundPayment` (throws)
6. `package.json` — keywords, peerDeps, exports
7. **Enable the provider per region** in Admin — registration alone does not expose it at checkout
8. **Register the Revolut webhook** for `ORDER_COMPLETED`; store the returned `wsk_` secret
9. Sandbox end-to-end **including a forced cart-completion failure**, proving no money is taken without an order

Steps 7–8 are install prerequisites, not polish.

**Tests** — security boundary and money path only:
signature (good / mutated body / future timestamp / 6-min-old / rotated multi-sig / malformed hex / missing
header); state mapping (all six, asserting `authorised → pending_authorization`); money both directions
(GBP 50.00↔5000, JPY 5000↔5000, KWD 50.00↔50000).

---

## 7. Why v1–v3 were wrong

| Plan | Bug | Found by |
|---|---|---|
| v1 | Manual capture: £40 capture charges £100, voids £60 | correctness — `CapturePaymentInput` has no `amount` |
| v1 | Rollback recovery impossible — no id, no `session_id` | correctness |
| v1 | Webhook carried no `amount`; ref is optional | correctness |
| v1 | No `redirect_url`; `webhookSecret` only warned | correctness |
| v1 | Future timestamps accepted | correctness |
| v2 | **Redirect before order → captured money, no order** | correctness pass 2 |
| v2 | `authorised → authorized` reopened the capture bug | correctness pass 2 |
| v2 | Refunds could double-refund | correctness pass 2 |
| v2 | `fromMinor` unspecified | correctness pass 2 |
| v1 | `metadata.session_id` had no reader | both reviews |
| v1 | `refunds[]` duplicated Medusa state | ponytail |
| v1 | 60-line vendored helper; 6 files | ponytail |
| v3 | Assumed a core PR was the distribution path | contribution guide |

Net across four passes: **two features cut**, **one flow inverted**, **one distribution assumption corrected** —
and the plan got shorter each time.
