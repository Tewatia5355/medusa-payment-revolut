# v0.1.0 spike — Revolut × Medusa

Not a plugin. A throwaway probe that settles three facts `PLAN.md` marks **UNVERIFIED**, before any of the
~300-line v1.0.0 provider gets written.

Two earlier plan revisions were rewritten because assumptions that looked reasonable turned out to be wrong.
This is the cheapest place to be wrong again.

## What it answers

| # | Question | Why it matters |
|---|---|---|
| 1 | Is `Revolut-Api-Version: 2026-04-20` accepted? | The OpenAPI spec permits it; the public changelog stops at `2026-03-12`. |
| 2 | Does `ORDER_COMPLETED` carry `merchant_order_ext_ref`? | It is **optional** in the webhook schema — only `event` and `order_id` are required. It is how the Medusa `session_id` gets home. |
| 3 | Does a real signature verify against the exact raw bytes? | Security boundary. Medusa discards any webhook result without a `session_id`. |

## Run

```bash
node verify.test.mjs            # no credentials needed — 12 assertions
```

Then, with a Revolut **Sandbox** Business account:

```bash
export REVOLUT_SECRET_KEY=sk_...
node spike.mjs                  # creates an order, prints checkout_url
```

In a second shell, expose a listener and register its URL as the webhook
(`POST /api/webhooks`, event `ORDER_COMPLETED`; store the returned `wsk_` secret):

```bash
export REVOLUT_WEBHOOK_SECRET=wsk_...
node spike.mjs listen
```

Pay the order at the printed `checkout_url`, then read the listener output.

## Gate

Do not start v1.0.0 until all three print the expected result. If #1 fails, fall back to
`REVOLUT_API_VERSION=2026-03-12`. If #2 prints `NO`, the design already handles it — the provider retrieves the
order anyway — but confirm before relying on either path.

## Already established locally

- `verify.mjs` matches Revolut's own reference Python implementation on their documented
  secret/payload/timestamp (`281b1f1a…`). Cross-language known-answer test.
- The docs' header sample `v1=09a9989d…` uses an **undisclosed** secret, so it is *not* a usable vector — it
  does not match their own reference code's output. Don't test against it.
- Tampering with a single trailing byte fails verification, confirming the raw body must never be
  parsed-and-re-serialized.
- Webhook payloads carry **no `amount`**, so the provider must retrieve the order to satisfy Medusa's
  `WebhookActionData`, which requires both `session_id` and `amount`.
