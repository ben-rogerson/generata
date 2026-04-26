---
"@generata/core": minor
---

`@generata/coding` template overhaul: replaced the 13-agent / 4-workflow pipeline with a single spec-driven `build-project` workflow built from 8 flat agents.

- New flow: `dream` (spec-creator) -> `plan` (plan-creator) -> `audit` (plan-reviewer, retries plan up to 2x with feedback) -> `execute` (code-writer) -> `verify` (code-reviewer, archives the project on reject) -> `readme` -> `tidy` (plucks the used idea from NOTES.md).
- Each project is self-contained under `projects/<plan_name>/` with `SPEC.md`, `PLAN.md`, `README.md`, and code as siblings. The legacy `code/` subdir convention is gone.
- Reject path archives the failed project to `projects/_archive/<plan_name>/` with a generated `REASON.md`.
- `NOTES.md` ships pre-populated with five starter ideas so `pnpm generata workflow build-project` works on a fresh init.
- Dropped: Cloudflare deploy, git committer, plan interview, ref enrichment, and the `execute-plan` / `daily-plan` / `dream-and-build` / `deploy-project` workflows.
- Manifest stripped: no `git` / `wrangler` / Telegram requirements; only `claude` is needed.

Breaking for existing users of the coding template - re-init to pick up the new pipeline.
