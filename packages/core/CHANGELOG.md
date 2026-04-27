# @generata/core changelog

## 1.1.0

### Minor Changes

- 28ae9d2: - Removed `@generata/sws` and `@generata/stock` from the catalog (`templates.json`); only `@generata/coding` exists today.
  - Coding template manifest: dropped `WORKDIR` from `requiredEnv` (the working directory is now set in `generata.config.ts`, no longer prompted as an env var). Tidied bin hints and rewrote `postInstall` to match the current init flow.
  - Coding README: updated the env table and added a note about configuring `workdir` in `generata.config.ts`.
- d0792d8: `@generata/coding` template overhaul: replaced the 13-agent / 4-workflow pipeline with a single spec-driven `build-project` workflow built from 8 flat agents.

  - New flow: `dream` (spec-creator) -> `plan` (plan-creator) -> `audit` (plan-reviewer, retries plan up to 2x with feedback) -> `execute` (code-writer) -> `verify` (code-reviewer, archives the project on reject) -> `readme` -> `tidy` (plucks the used idea from NOTES.md).
  - Each project is self-contained under `projects/<plan_name>/` with `SPEC.md`, `PLAN.md`, `README.md`, and code as siblings. The legacy `code/` subdir convention is gone.
  - Reject path archives the failed project to `projects/_archive/<plan_name>/` with a generated `REASON.md`.
  - `NOTES.md` ships pre-populated with five starter ideas so `pnpm generata workflow build-project` works on a fresh init.
  - Dropped: Cloudflare deploy, git committer, plan interview, ref enrichment, and the `execute-plan` / `daily-plan` / `dream-and-build` / `deploy-project` workflows.
  - Manifest stripped: no `git` / `wrangler` / Telegram requirements; only `claude` is needed.

  Breaking for existing users of the coding template - re-init to pick up the new pipeline.

- ac65068: Drop the `name` field from `defineAgent()` and `defineWorkflow()` - names are derived from each file's path relative to `agentsDir`. Workflows can now live anywhere under `agentsDir`; the `workflowsDir` config option has been removed. The CLI accepts either the canonical name (`core/plan-dreamer`) or just the basename (`plan-dreamer`) when the basename is unambiguous.
- e2dd9b7: `generata init` now detects which package manager invoked it (via `npm_config_user_agent`) and uses that PM for the install step in fresh projects. So `npx @generata/core init ...` runs `npm install`, `pnpm dlx @generata/core init ...` runs `pnpm install`, and so on. Existing projects with a lockfile still get matched against that lockfile.
- 9f42508: `generata init` now runs in non-empty directories. Existing files are preserved; template-file conflicts error unless `--force` is passed. Removes the previous "use 'generata add'" loop where users with existing files couldn't init or add.
- 184d89f: `generata init` now writes a default `generata.config.ts` if one doesn't already exist in the destination. Previously, init scaffolded `agents/`, `package.json`, `.env`, and slash commands but no anchor file, so subsequent commands like `generata help workflows` would fail with "No generata.config.ts found". The default config sets sensible Claude model tiers and points `workdir` at the destination directory; users can edit it freely. Existing config files are preserved.
- 0bd93ab: Make `workDir` optional in `defineConfig`. `loadConfig` now back-fills it from the directory containing `generata.config.ts`, so user configs no longer need to repeat the path.
- 70d6533: Added two new catalog templates alongside `@generata/coding`:

  - **`@generata/starter`** - bare-minimum scaffold (one worker agent, one workflow). Designed to be edited or thrown away as users build their own pipeline. Good for learning the model without inheriting a use case.
  - **`@generata/standup`** - daily standup generator. Reads yesterday's git activity and drafts a 3-section update (yesterday / today / blockers). Two agents demonstrating two-step composition.

  Both appear in `generata help templates` and `generata init` (no args) listings.

- c47b493: Template `README.md` now lands at `README-<alias>.md` in the destination instead of overwriting the user's own `README.md`. Alias is derived from the manifest name (`@generata/coding` → `README-coding.md`). Multiple templates can now coexist in one project (e.g. via `add`) without README conflicts. Templates can still override the path explicitly via `installPaths` in their manifest.
- 3a0bbe8: Workflow runs now print the final agent's text output below the step-done line, mirroring how single-agent runs (`generata agent ...`) display their result. Skips empty output, the interactive-session placeholder, and critic last-steps (whose verdict summary already prints). Applies to both static workflows and supervisor-generated workflows.

### Patch Changes

- 7d6904a: fixed release action
- 1a99693: update github workflows
- 7d1d6ee: Rename the `workdir` field in `generata.config.ts` to `workDir` to match the camelCase convention of the other directory fields (`agentsDir`, `workflowsDir`, `metricsDir`, `logsDir`). The internal `work_dir` Jinja template builtin is unchanged.

  **Breaking:** existing config files must rename `workdir:` to `workDir:`. The init scaffolder now generates the new spelling.

- 611c893: `generata init` no longer crashes when the template scan can't import an agent or workflow file (typically because a fresh template clone has no `node_modules`). Files that fail to load are skipped with a single summary line; the workflow precheck still catches missing env vars at run time.
- f657c93: `generata init` no longer writes a 0-byte `.env.example` when the template declares no `requiredEnv` and no scanned agent declares `envKeys`. Prints a one-line note in its place so the step output stays accurate.
- cc3f90f: `init` and `add` no longer treat identical files as conflicts. If the destination file already has byte-identical content to what the template would write, the copy is skipped silently and not counted as a conflict. Only files whose content differs trigger the existing "re-run with --force" error. Re-running `init`/`add` against an unchanged template is now idempotent.

## 1.0.0 - 2026-04-25 (initial release)

First public release. Highlights:

- Engine + CLI (`generata`) for running multi-agent workflows on top of the Claude Code CLI.
- Project root anchored on `generata.config.ts` (walk-up discovery).
- Public API: `defineAgent`, `defineWorkflow`, `defineConfig` and their types.
- `generata init <template>` scaffolds a project from a template (catalog alias, GitHub short-form, full git URL, or local path).
- `generata add <template>` merges a template into an existing project.
- `generata help`, `generata skills sync`, plus the existing `agent` / `workflow` / `validate` / `metrics` commands.
- Built-in catalog of `@generata/*` template aliases, starting with `@generata/coding`.

### Known limitations

- The bin re-launches node with `--import tsx` to load user `.ts` files; this means tsx is a runtime dependency. Future versions may switch to Node's native TS loader once it stabilises.
- User-level `templateAliases` in `generata.config.ts` is parsed by the schema but not yet consulted by the resolver - planned for a future minor release.
- `--strict-engine` semver enforcement is not yet implemented; engineVersion mismatches log a warning only.
