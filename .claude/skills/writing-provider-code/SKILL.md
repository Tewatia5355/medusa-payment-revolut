---
name: writing-provider-code
description: House style for the medusa-payment-revolut plugin. Use when writing, reviewing, or refactoring any code in this repo — the v1.0.0 payment provider, its tests, or a release. Covers the evidence rule (read Medusa/Revolut source, never infer from docs or memory), Medusa v2 conventions and formatting, comment density targets, ponytail simplification, the money-handling traps already paid for in production-grade defects, and how to contribute upstream.
---

# medusa-payment-revolut house style

Conventions for this repo, derived from measurement rather than taste. Every rule below cites the source or
the incident that produced it. Apply to v1.0.0 and later.

## 1. Evidence before code

**Read the source. Never infer an API from documentation, blogs, or memory.**

This is not a stylistic preference — it is the rule that has caught every serious defect here:

- Public guidance for Medusa payment providers is mostly **v1** (`createPayment`,
  `refundPayment(paymentData, refundAmount, context)`). Those do not exist in v2. Following it produces code
  that does not compile.
- The Revolut docs' own webhook header example `v1=09a9989d…` does **not** match what their reference Python
  implementation outputs from their documented secret. It uses an undisclosed secret. Testing against it means
  chasing a phantom bug.
- The OpenAPI spec claims `signing_secret` is "included in all webhook responses". It is not — create returns
  it, list does not.

When you cannot verify something, write **`UNVERIFIED`** next to it and resolve it in Sandbox with
`npm run test:e2e:live`. Do not fill the gap with a plausible guess. Several redesigns came from assumptions
that read as reasonable and were wrong.

Pin versions in citations: Medusa `v2.19.0`, Revolut Merchant OpenAPI `2026-04-20`.

## 2. Medusa house style

Verified against `medusajs/medusa@v2.19.0`.

`.prettierrc` is copied from theirs — `semi: false`, `singleQuote: false`, `tabWidth: 2`,
`trailingComma: "es5"`, `arrowParens: "always"`, default 80 print width. Run `npx prettier --write` before
committing; CI-less repos rot fast.

Follow the official Stripe provider (`packages/modules/providers/payment-stripe/`) for structure:

- `src/providers/<name>/index.ts` exports `ModuleProvider(Modules.PAYMENT, { services: [...] })`
- `static identifier` on the service class; registration rejects classes without it
- Errors **throw**. The v2.0 `{ error, code, detail }` return union is gone; returning it now reads as success.
- Keep request, status-mapping and webhook logic together until a second payment method exists. Stripe keeps
  all of it in one 822-line base class.
- Publish keywords: `medusa-v2`, `medusa-plugin-integration` (these drive the automatic npm scrape onto
  Medusa's integrations page), plus `medusa-plugin-payment`.
- `peerDependencies` pins the exact Medusa version, mirrored in `devDependencies`.

## 3. Comments

**Measured target: Medusa's Stripe provider is 3% comment lines. Ours drifted to 31%. That was 10× too dense.**

Comment the **constraint**, not the code. One line unless the reason genuinely needs two.

Keep a comment when a maintainer would otherwise break something invisible:

```js
// An empty string is a usable HMAC key, so forged signatures would verify against it.
// Medusa delivers rawData as string | Buffer (mutations.ts:355).
// Digits only; Number() would silently accept "", " ", "+1" and "1e3".
```

Cut a comment that narrates what the code already says, or that argues for its own existence. Ponytail:
*if the explanation is longer than the code, delete the explanation.*

Security-critical files may run denser than 3% — `verify.mjs` sits near 19% because each comment encodes a
defect that was actually exploited. That is the ceiling, not the target.

Medusa's own comments are the model — see `stripe-base.ts:162-201`, where two lines explain why an API error
is indeterminate. Short, causal, non-obvious.

## 4. Ponytail

Stop at the first rung that holds. Applied to this repo, the ladder has already deleted real code:

| Rung | What it killed here |
|---|---|
| Does it need to exist? | Manual capture, refunds — both cut from v1.0.0 |
| Already in the codebase? | — |
| Stdlib? | 60-line vendored `getSmallestUnit` → `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` |
| One line? | `api()` wrapper with one caller → inline `fetch` |
| Minimum that works | 6 files → 3 |

Specific habits:

- **No config for a value that never changes.** The `capture` option died when v1.0.0 became automatic-only.
- **No helper with one caller.** A generic `minor(amount, currency)` serving one hardcoded £12.34 became
  `amount: 1234`.
- **Deletion over addition.** Every review pass so far made the plan shorter, never longer.
- **Never simplify away** input validation at trust boundaries, error handling that prevents data loss, or
  security measures. The `{ ok, reason }` result shape survives review because distinguishing *misconfiguration*
  from *attack* in logs is operational security signal, not decoration.

## 5. Money and payment rules

Non-negotiable, each learned from a defect:

- **Never trust the browser.** Confirm state by retrieving the order server-side.
- **Verify signatures before any use of the payload** — before parsing, logging, or acting.
- **Hash raw bytes.** Never parse-and-re-serialize; never interpolate a Buffer into a template string, which
  decodes as UTF-8 and replaces invalid bytes with U+FFFD.
- **Use the order `amount`, never `settled_amount`.** They differ by the acquiring fee (1234 vs 1202).
- **Convert currency with `MathBN`, not floats.** `Math.round(1.005 * 100)` returns `100`, not `101`.
- **Assume duplicate webhook delivery.** Observed twice for one payment. Handlers stay side-effect-free.
- **Persist a minimal projection.** Retrieved orders carry cardholder name, payer email and card BIN. Store
  `id`, `state`, `amount`, `currency`, reference, `checkout_url` — never the full order, never log it.
- **Idempotency keys on every mutating call.** Medusa supplies `context.idempotency_key`.

## 6. Tests

One test file. Cover the **security boundary** and the **money path**. Nothing else earns a test.

- Assert against **known-answer vectors** from the provider's own documentation, cross-checked against their
  reference implementation.
- Every fixed vulnerability gets a regression assertion that fails if the fix is reverted.
- Do **not** assert language or framework behaviour — `assert.doesNotThrow` around a call whose return value
  you already assert is noise, because a throw fails the assertion anyway.
- Do not hardcode an assertion count in the output; it goes stale on the next edit.

## 7. Distribution and upstream contribution

Ship as a standalone npm package. **Do not open a PR against `medusajs/medusa`.**

Core contains exactly one payment provider (`payment-stripe`); every community provider is a separate repo.
Publishing with the `medusa-v2` and `medusa-plugin-integration` keywords puts the plugin on Medusa's
integrations page automatically — an npm scrape, no human in the loop, no submission.

### If something genuinely belongs upstream

**Do not open an issue for a feature.** `.github/ISSUE_TEMPLATE/config.yml` sets `blank_issues_enabled: false`
and routes feature requests to Discussions. Issue templates exist only for bug reports and docs.

| Intent | Venue |
|---|---|
| Feature idea | Discussions → **Feature Requests** |
| API or type-signature change | Discussions → **RFC** |
| Reproducible core bug | Issue (`bug_report_v2.yml`) |
| Announce a released plugin | Discussions → **Show and tell** |
| Question | Discord |

Then, per `CONTRIBUTING.md`:

1. Discussion first. *"Reach out to CODEOWNERS instead of directly submitting a PR with all the changes…
   the PR is not accepted, which will be the case if it does not align with our roadmap."*
2. `CODEOWNERS` maps `/packages/` → **@medusajs/os**, `/www/` → @medusajs/docs, everything else →
   @medusajs/core.
3. Only then: fork, branch from `develop` with a `feat/` or `fix/` prefix, add a changeset
   (`yarn changeset`; patch for non-breaking), write unit **and** integration tests, and fill the PR template's
   **What / Why / How / Testing** plus an `// Example usage` snippet. PRs are squash-merged.

### Realistic expectations

`CONTRIBUTING.md` states external PRs are triaged *"not at any fixed cadence"*. Sampling the five Feature
Requests opened between 2026-08-20 and 2026-08-29: 1-2 upvotes each, 0-1 comments, none answered by a
maintainer. Issue #11609 was closed `not_planned`.

**Post if useful, but never block a release on a reply.**

### The one open upstream item

`CapturePaymentInput` is an empty interface, so the capture amount never reaches the provider, which makes
partial capture impossible to implement correctly (see §5). That is an RFC for @medusajs/os — and only worth
raising once a shipped plugin and a real user back it. A speculative type change from a stranger is the
category `CONTRIBUTING.md` says gets declined.
