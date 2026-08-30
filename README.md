# medusa-payment-revolut

A Revolut Merchant API payment provider for [MedusaJS v2](https://medusajs.com).

**Status: pre-v1. The v0.1.0 spike is written; the provider is not.**

## Why this exists

There is no Revolut integration for any modern headless commerce platform. Verified across Medusa, Vendure,
Saleor, Sylius, Spree, Solidus and Bagisto — all zero. Revolut officially supports six no-code platforms
(WooCommerce, Magento 2, PrestaShop, Shopify, BigCommerce, OpenCart) and no headless ones.

Nobody is working on it either: zero PRs, zero issues, zero discussions in `medusajs/*`; nothing on GitLab; and
the one npm package that ever claimed the name, `medusa-payment-revolut`, was published on 2024-10-02 at
18:48 UTC and unpublished 19 minutes later with no linked repository.

## Where it stands

| Version | Capability | Status |
|---|---|---|
| **v0.1.0** | Sandbox spike — settle three unverified facts | code written, needs Sandbox credentials |
| **v1.0.0** | Hosted checkout, automatic capture, webhooks, cancel | not started — gated on v0.1.0 |
| v1.1.0 | Refunds with reconciliation | deferred (double-refund risk) |
| v1.2.0 | Embedded checkout | demand-driven |
| v2.0.0 | Manual / partial capture | blocked on Medusa core |

See [`PLAN.md`](./PLAN.md) for the full plan and [`spike/`](./spike) to run the gate.

## How this was built

Every design decision cites source read directly — Medusa `v2.19.0` and the Revolut Merchant OpenAPI
`2026-04-20` — rather than documentation prose or search results. Public guidance for this task is largely
wrong: most of it describes the Medusa **v1** provider API, which does not exist in v2.

The plan went through three review passes and was rewritten three times. Each pass found a way the integration
could take money incorrectly:

1. **Partial capture overcharges.** `CapturePaymentInput` is an empty interface, so the amount never reaches
   the provider; Revolut treats an omitted capture amount as *capture everything* and voids the remainder.
   A £40 capture against a £100 authorization charges £100. → manual capture cut.
2. **Captured money with no order.** Redirecting before cart completion, then completing after payment, hits
   `continueOnPermanentFailure: true` — Medusa keeps the payment even when order creation fails, and the
   compensation path cannot cancel an already-completed Revolut order. → order created *before* redirect,
   using `pending_authorization`.
3. **Double refunds.** On an ambiguous failure Medusa deletes its Refund record; a retry gets a new refund id,
   and that id *is* the idempotency key. → refunds deferred to v1.1.0.

A fourth pass corrected the distribution assumption: this ships as a standalone npm package, not a core PR.
Medusa core contains exactly one payment provider (`payment-stripe`), and `CONTRIBUTING.md` states external
PRs are rejected if they do not align with the roadmap.

Research briefs with full citations are in [`docs/`](./docs).

## License

MIT
