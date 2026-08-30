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
| 3 | Forged / stale / unsigned | all rejected with 204 |
| 4 | Transient Revolut outage | 503 so Revolut retries, then 200 once it recovers |
| 5 | Out-of-order event | `ORDER_COMPLETED` arriving before the order reads `completed` is acknowledged but not actioned; a later delivery captures |
