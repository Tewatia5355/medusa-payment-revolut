# AGENTS.md

Read `.claude/skills/medusa-revolut/SKILL.md` before writing or reviewing code here. It is the single source
of house style: evidence rules, Medusa conventions, comment density, ponytail, and the payment traps this repo
has already paid for.

Quick facts, so you don't rediscover them:

- Targets Medusa `v2.19.0` and Revolut Merchant OpenAPI `2026-04-20`. Cite source at those versions.
- Most public guidance describes Medusa **v1** and is wrong here. Read `medusajs/medusa` source instead.
- `PLAN.md` is the versioned plan. v0.1.0 is complete; v1.0.0 is next.
- `npx prettier --write` before committing. Config is copied from Medusa's `.prettierrc`.
- `node spike/verify.test.mjs` runs with no credentials and must stay green.
