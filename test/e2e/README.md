# End-to-end test

Unit tests cover the provider in isolation. This exercises the part they cannot: the real Medusa
runtime chain — cart → payment session → `cart.complete` → webhook → captured payment — against a
live Medusa instance.

`mock-revolut.mjs` replays response shapes recorded from real Revolut Sandbox calls during the
v0.1.0 spike, and adds `/_test/*` controls to force order states and simulate outages. That makes
scenarios reproducible without credentials, and lets us test failures Revolut will not produce on
demand.

## Run

```bash
docker run -d --name medusa-pg -e POSTGRES_PASSWORD=medusa -e POSTGRES_USER=medusa \
  -e POSTGRES_DB=medusa -p 5433:5432 postgres:16-alpine

npx create-medusa-app@2.19.0 mstore --db-url postgres://medusa:medusa@localhost:5433/medusa --seed
```

Install this plugin into the app (`npm pack` here, then `npm install <tarball>` there), add to
`medusa-config.ts`:

```ts
plugins: ["medusa-payment-revolut"],
modules: [{
  resolve: "@medusajs/medusa/payment",
  options: { providers: [{
    resolve: "medusa-payment-revolut/providers/revolut",
    id: "revolut",
    options: {
      apiKey: "sk_test_mock",
      webhookSecret: "wsk_mocksecret",
      redirectUrl: "http://localhost:8000/return",
      baseUrl: "http://localhost:4555",   // the mock
    },
  }] },
}]
```

Enable the provider for your region, then:

```bash
node test/e2e/mock-revolut.mjs &
PK=<publishable key> REGION=<region id> node test/e2e/run.mjs
```

## Scenarios

| # | Scenario | Asserts |
|---|---|---|
| 1 | Happy path | session is `pending_authorization`, `checkout_url` present, no PII in session data, **order exists before payment**, webhook captures |
| 2 | Duplicate delivery | replaying the webhook twice does not change `captured_amount` — duplicates were observed against real Sandbox |
| 3 | Forged / stale / skewed | forged and unsigned are acknowledged with 204; stale asks for retry with 503; a few ms of future skew is accepted |
| 4 | Transient Revolut outage | 503 so Revolut retries, then 200 once it recovers |
| 5 | Out-of-order event | `ORDER_COMPLETED` arriving before the order reads `completed` is acknowledged but not actioned; a later delivery captures |

## Live Sandbox verification

`live-sandbox.cjs` drives the **compiled provider against real Revolut Sandbox** — no mock. This is what the
mock cannot prove: that Revolut actually behaves the way the recorded fixtures claim.

```bash
npm run build
REVOLUT_SECRET_KEY=sk_... npm run test:e2e:live
```

Credentials are read from the environment and never written to disk. It creates real Sandbox orders, cancels
the ones it can, and prints a payable link for the webhook phase.

### Why this exists

Running it found a bug no amount of mocking would have: **Revolut's `Revolut-Request-Timestamp` arrives a few
milliseconds ahead of an NTP-synced clock** (measured -3ms and -32ms on genuine deliveries). Revolut's own
reference implementation uses `age >= 0`, which rejects those. Combined with acknowledging every verification
failure, a real payment was being silently discarded. The mock never reproduced it because it signed with
local `Date.now()`, so the age was non-negative by construction.
