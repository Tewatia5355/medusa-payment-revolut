# Security policy

This plugin handles payments. A vulnerability here can cost real money, so please report it privately
rather than opening a public issue.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/Tewatia5355/medusa-payment-revolut/security/advisories/new)
on this repository. Please do **not** open a public issue, pull request, or discussion for a security
problem before it is fixed.

If that link is unavailable, open an issue containing only "requesting a private security contact" — no
details, no reproduction — and I will open a private channel.

Include, if you can: what you did, what happened, what you expected, and the affected version.

## Scope

In scope — anything that could take, lose, or misreport money:

- webhook signature verification bypass or forgery (`src/providers/revolut/webhook.ts`)
- capturing an amount that differs from what the order records
- payments recorded against the wrong cart, session, or order
- a captured payment producing no Medusa order, or an order with no payment
- double capture, double refund, or replay that changes the ledger
- credentials or cardholder data leaking into logs, errors, or persisted `data`

Out of scope:

- vulnerabilities in Medusa core or the Revolut API themselves — report those to their maintainers
- the mock server under `test/e2e/`, which is a test fixture and never runs in production
- missing hardening in the example storefront code under `examples/`, which is illustrative

## Known limitations

These are deliberate and documented, not vulnerabilities:

- refunds are unsupported; `refundPayment` throws rather than risk a double refund
- manual and partial capture are unsupported, because `CapturePaymentInput` carries no amount
- a drifted remote order is refused and logged for manual reconciliation rather than booked

## Handling

I will acknowledge a report as quickly as I reasonably can, and will credit you unless you would rather
stay anonymous. This is a community project with no commercial support behind it, so please calibrate
your expectations for response time accordingly.
