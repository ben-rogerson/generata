# @generata/core changelog

## 1.3.0

### Minor Changes

- 16aeb16: feat: pin template catalog entries to core version
- 9a3a2e2: feat(core): add head field to ContextSource for trimming context to first N lines
- 2524d75: Expose `loadTs` and `findProjectRoot` as public exports so consumer packages (notably `@generata/serve`) can resolve project-relative TypeScript modules.

  Add an optional `serve` field to `GlobalConfig` so `defineConfig({ serve: {...} })` typechecks for users of `@generata/serve`. Core ignores the field; the serve package validates and consumes it.

- d17256b: Allow factory-form agents with no declared inputs to be passed bare to `.step()` and `onReject`. Previously, `defineAgent<{}>(() => ({...}))` had to be wrapped as `.step("id", () => agent({}))` even though there were no inputs to thread - the engine now wraps such factories itself, so `.step("id", agent)` works. Factories with declared inputs are still required to be called inside a stepFn so prior-step outputs thread through correctly.
- 66b0511: Programmatic `runWorkflow` / `runAgent` now write prompt logs to the same `<logsDir>/<kind>/<name>-<runId>.log` paths the CLI uses, mirroring the CLI's `logPrompts` flow. The path is printed once to stderr at run start as `Full log: file:///...` so callers can click through and tail the file as it streams - this fires for both CLI and programmatic runs, with or without `onEvent`. Pass `promptLogFile` to override the path.

  Silent-mode programmatic runs also print a header to stderr: `workflow: <name> (<n> steps)` or `agent: <name> [<type>]`. Suppressed when `onEvent` is wired (the caller is driving display).

  Auto-derived programmatic log paths now prepend the calling script's basename - e.g. `logs/workflow/batch-script-review-note-<runId>.log` instead of `logs/workflow/review-note-<runId>.log` - so logs from different scripts driving the same workflow are easy to tell apart. CLI runs and explicit `promptLogFile` overrides are unaffected.

  `consoleSink` no longer prints the prompt log path itself on `workflow-start` / `agent-welcome` - `runWorkflow` / `runAgent` are now the single source for that line.

  The `logPrompts` config default has flipped from `false` to `true` - prompt logs are on by default for both CLI and programmatic runs. Set `logPrompts: false` in `generata.config.ts` to opt out.

- 18264a7: Expose `runWorkflow` and `runAgent` as public API so workflows and agents can be driven from code. Programmatic callers run silently by default and subscribe to structured `EngineEvent`s via `onEvent`. The CLI is unchanged in behaviour.

  `AbortSignal` is now wired through `runWorkflow` end-to-end: a pre-aborted signal short-circuits before precheck/worktree setup, and a signal that fires mid-step bypasses the per-agent retry loop and propagates `AbortError` to the caller.

  The `EngineEvent` union now emits a discrete `halt` event when a worker calls `emit --halt`, and `workflow-start` carries the `runId` (the same id stamped into per-step metric records) so subscribers can correlate events with metrics.

  One internal-behaviour change worth flagging: critic-step max-retries no longer throws inside the engine. The CLI now exits non-zero by checking `result.success`. Same observable outcome for end users; loop-friendly contract for programmatic callers.

- be78f7a: feat: make Read/Glob/Grep filesystem tools opt-outable for full agents
- c6ac72f: refactor: remove redundant ModelTier and LLMAgentDef aliases
- ddab78e: feat(cli): rename skills sync to commands sync
- b38d4c9: feat(cli): generate slash commands with detected package manager
- 27e4f47: `worktree({...})` now accepts a `cleanup` field (default `false`). When `false`, the worktree and its `generata/wt-<runId>` branch are kept on disk after the workflow finishes so you can inspect the run; pass `cleanup: true` to restore the previous teardown-on-exit behaviour. The engine logs `[worktree] cleaned up <path>` or `[worktree] preserved at <path>` at end of run. Setup-failure cleanup is unchanged - half-built worktrees are still torn down. Use `generata worktree prune` to clear preserved worktrees.
- b9d8165: Fix worktree isolation prompt header and surface typed outputs on `WorkflowResult`.

  The prompt's `Working directory:` line (and the agent factory's `${work_dir}` substitution) now reflect the actual cwd the agent runs in, not the user-config workDir. Agents under worktree isolation were previously misled into resolving absolute file paths against the main repo and mutating it instead of the worktree.

  `WorkflowResult` now exposes `outputs: Record<string, string>` (typed outputs accumulated across steps) and `worktreePath?: string` (when the workflow ran with worktree isolation), so programmatic post-workflow drivers can read what agents emitted and locate the worktree without re-deriving either.

### Patch Changes

- 5613d29: Capture kill reason and signal in agent metrics. When a timeout fires the runner records `killReason`, the OS signal, and any abnormal close-delay in `metrics.error`, and sets `status: "timeout"`. Previously a SIGTERM kill left only the benign "no stdin data received in 3s" warning and a generic "failure" status, making it impossible to distinguish timeout from crash.
- 1a19c00: fix(core): prevent child process zombies by detaching and signalling process groups
- 3e359d0: refactor(core): extract emit result-parsing logic into parseCloseResult helper
- 1a3725d: fix(core): add deprecation warning for bare AgentDef step slot
- 5f32d49: Deduplicate build and prepare scripts. Set prepare to call pnpm build so future changes to the build process happen in one place.
- fb9b3b3: fix(cli): detect bun lockfile in detectPm
- c1f3175: docs(templates): fix coding manifest description to match actual workflow
- 8305898: docs: update coding template README to use commands sync instead of deprecated skills sync
- ceb0b72: docs: update spec-creator protocol docs to match current outputs
- 94a9684: fix: add "commands" to reserved commands for CLI routing
- ff6b646: docs: correct stale command and monorepo references in core README
- 6a2000b: Dedupe metrics printing in the CLI. Internal refactor that extracts a `printSummary` helper so the today/week/agent metrics commands share one formatter; output is unchanged.
- 2686c7b: Drop the `generata` ASCII banner and randomised tagline from the start of `generata agent` and `generata workflow` runs. The workflow start header (name, isolation, prompt log) is now the first thing printed. Removes the `logBanner` and `pickWorkflowTagline` exports from `@generata/core/logger`.
- a40de4d: refactor(core): extract template install defaults to shared utility
- df28c99: fix(core): treat timeout status same as failure in retry logic
- 5c8616e: fix: remove unreachable plan-move block that assumed code/ subdirectory
- acf2cfa: fix: extract executeWorkflow helpers to reduce function length
- 8ee8dc3: fix(core): remove placeholder name from factory-form agent error
- 274371d: fix: align fallback config defaults with GlobalConfig schema
- 7e609ea: docs: document filesystemAccess agent option
- ad8308f: fix: parse @ref suffix from git URLs in classifySpecifier
- 432df83: docs: add GlobalConfig field reference table
- d2d6bc5: fix(init): sync haiku model id to match runtime fallback
- 1ffc8b0: fix: show metrics subcommands in help instead of ellipsis
- edd4132: fix: update help text to reflect 'commands sync' as primary command
- 885fdc0: fix: scaffold "commands:sync" instead of deprecated "skills:sync" in init
- 6fabb5e: docs: fix metrics command example in README
- 4bd214e: fix: error handling for unknown metrics subcommands
- 6925905: fix: only emit params instruction for initiator planners
- 513d89d: Prevent shell injection in macOS notifications by using execFileSync instead of string interpolation.
- b37a6f8: refactor(core): remove plan_name auto-mapping from CLI
- a7c5edd: Fix preflight uses platform-specific command lookup. Use `where` on Windows and `which` on Unix-like systems to properly detect CLI tools on all platforms.
- 3d8d50d: fix(core): replace profane taglines with professional alternatives
- 53b5e3f: docs: document --profile flag in CLI help workflow section
- 74679ef: docs: document promptContext feature for injecting file context into agent prompts
- 72808cf: fix(core): prevent read-only agents from writing arbitrary files
- e98bdf4: fix(core): use absolute-path syntax for read-only emit permission so the agent's Write call actually matches
- 37d6d5b: docs: add outputs declaration to README defineAgent example
- 108ad1d: fix: remove verboseOutput from scaffolded config
- 6acaa44: fix(cli): mask secret environment variable input during prompts
- c04e0ab: feat: include optional variables in slash-command argument hints
- 1f28af6: fix: add outputs declaration to standup-writer agent
- a54a105: fix: update starter README to reference 'commands sync' instead of deprecated 'skills sync'
- 437601d: fix(core): surface errors when resolveStepShape stepFn throws
- 8c86320: fix: remove orphaned isStructuralHalt protocol
- a1bf0e4: fix: make TemplateManifest schema strict to reject unknown keys
- 1ad51db: fix: remove unused profiles field from TemplateManifest
- 44618b5: Expand templates README with typed-output workflow example. Documents how typed outputs flow between workflow steps with full type safety.
- 23a035b: docs(templates): document installPaths defaults and merge behaviour
- 6ebd0a0: Skip .DS_Store files when copying templates during project initialization, preventing macOS metadata files from being included in user projects.
- 1491d60: fix: deduplicate base tools in buildAllowedTools
- 68488b0: refactor(core): unify workflow step shapes to stepFn-only form
- 35b0c1d: Upgrade tooling (TypeScript 6, zod 4, oxlint/oxfmt) and skip template scan during `generata init` when the template's `node_modules` is missing. Avoids confusing import errors during first-run scaffolding before deps are installed.
- 508f072: fix(core): validate all required workflow params in --all mode
- ec7b526: docs: clarify workflow layout convention and starter template usage
- d0bfe3f: fix: merge workflow.variables defaults into stepFn params
- 1d9a076: `setupWorktree`'s cleanup now probes the throwaway branch with `git rev-parse --verify` before issuing `git branch -D`. Skipping the delete when the branch is gone keeps cleanup quiet for callers (e.g. shippers) that have renamed the worktree branch to a semantic name and pushed it.
- 832770f: fix(cli): add worktree to reserved commands for proper routing
- a59ee2f: `setupWorktree` no longer wraps `git fetch`, `git worktree add`, and the install command in animated spinners. Each step now prints a plain `→ worktree: ...` line instead. The spinners often appeared frozen on fast operations because the work completed before the animation could cycle, and the cursor blinking on top of the braille frames read as buggy.

## 1.2.0

### Minor Changes

- b149d58: Brand `WorktreeConfig` so `isolation` requires the `worktree()` helper. The previous structural type let raw object literals assign through; the brand forces consumers to use the helper or omit the field.
- 95fd6ca: Chain-builder workflow API + typed factory agents. `defineWorkflow` now returns a fluent builder (`.step().step().build()`) and `defineAgent` accepts a factory `(inputs) => config` that types the agent's input contract. Workflow→agent wiring typos and forward-step references error in the editor; the engine no longer auto-leaks prior step outputs to agents (only what a stepFn explicitly maps reaches the agent). Breaking for code on the previous `defineWorkflow({ steps: [...] })` shape — pre-1.0 surface, no published consumers yet, so a minor bump.
- d16de2b: Add shorthand for running workflows: `generata <name>` is now equivalent to `generata workflow <name>`. The first positional argument is treated as a workflow name unless it matches a reserved subcommand (`init`, `add`, `agent`, `workflow`, `run`, `validate`, `metrics`, `skills`, `help`). The longer form keeps working unchanged.
- 56082cf: Short-circuit critic retry on STATUS: halt and narrow Tool enum. The engine now breaks the critic-rejection retry loop when the worker reports a structural halt, since retrying cannot resolve a spec/plan-level conflict. The Tool enum drops `"read"`, `"glob"`, `"grep"` (no-op tokens that were never wired to the runner); shipped templates are updated to declare only the tools they use.
- cc1687a: Remove agent summaries feature. The post-agent humanize step added latency and cost to every run for a recap most users skipped, and the `agentSummaries` config option is now gone.
- a7b38c1: Remove the `supervisor` agent type. No shipped template used it, and the dynamic-workflow-generation path it powered added complexity to the `agent` CLI without a corresponding consumer. `defineAgent({ type: "supervisor", ... })` is no longer accepted.
- bc019d7: Rename agent `promptTemplate` field to `prompt`. The shorter name reads naturally and matches the field's role - it's the prompt string the LLM sees, not a "template" in any generative sense (the factory's closure handles interpolation). Breaking for any code that references `agent.promptTemplate` or sets it on a `defineAgent` literal; pre-1.0, no published consumers, so a minor bump.
- c4d49df: Redesign the run header: rainbow `generata` banner with an italic tagline, a `7d · …` weekly metrics line (new `showWeeklyMetrics` config, default on) that compares against the prior 7 days, and the prompt log path shown in-header when `logPrompts` is on. Prompt log files now live at `<logsDir>/<kind>/<basename>-<runId>.log` with collision-aware fallback. Agent type colours moved to cyan/magenta/orange so they no longer clash with status colours.
- 372554b: Show isolation mode (`local` or `worktree: <path>`) in the workflow start header so the run environment is visible at a glance and the worktree location is discoverable. Adds an optional `isolation` parameter to `logWorkflowStart` and exports a new `WorkflowIsolation` type.
- 45d9593: Add `showPricing` config option (default `false`). When off, runtime logs and notifications hide USD costs and show token counts instead. The `generata metrics` subcommand still surfaces cost as before. Set `showPricing: true` in `defineConfig` to restore the previous behaviour.
- d24a3b1: Typed outputs, first-class halts, and surgical bin permissions.

  - New `outputs: Record<string, string>` field on agents (key → LLM-facing description). Engine wires a per-agent emit bin with surgical `Bash(<bin>:*)` permission, parses the captured values, and merges them into the runtime params bag. Chain builder threads the literal output keys through `TBaseParams` so downstream stepFns destructure them with full type-safety.
  - First-class halts: agents call `--halt "<reason>"` via the emit bin to stop the workflow cleanly (no metric failure, downstream steps skipped, `haltReason` set). Replaces text-sentinel patterns (`STATUS: halt`, `NO_ITEMS`, etc.).
  - Factory-form `onReject`: `StepOptions.onReject` accepts a typed stepFn `(params) => StepInvocation` with the same contextual typing as `.step()`. Wrap factories in a stepFn to use them as rejection handlers.
  - Internal: `verdict`/`params` bin permissions tightened to surgical `Bash(<bin>:*)` patterns (no more broad `Bash` injection for critics/planners).

- f308457: Add `verboseOutput` config flag. Workflow runs now show a per-step spinner with tagline by default; set `verboseOutput: true` to restore the inline tool-event stream. Configs scaffolded by `generata init` opt in.
- a869be2: Add `isolation: "worktree"` opt-in to `defineWorkflow`. When enabled, the workflow runs against a fresh git worktree created from `origin/main`, while logs, metrics, and a configurable list of `sharedPaths` symlink back to the main checkout. The worktree is pruned at run end regardless of outcome. New CLI: `--worktree` / `--local` runtime overrides on `generata workflow <name>`, and a `generata worktree prune` recovery subcommand for orphaned worktrees.
- 0898ef6: Add `baseRef` to `WorktreeConfig` so workflows can override the default `origin/main` base for git-worktree isolation. A `<remote>/<branch>` value triggers a fetch first; a bare branch like `"main"` is treated as a local ref and used without fetching.

### Patch Changes

- 1407041: Print help for bare `generata` invocation instead of `Unknown command: undefined`. New users running the CLI with no arguments now discover the available subcommands.
- 31a7774: Add test guidance to the `coding` template's markdown-slide-deck starter idea in NOTES.md. The seed now spells out the Ink testing approach (use `ink-testing-library` with `lastFrame()` and `stdin.write` rather than driving the built binary via `expect`/`script`) and requires a sample deck at `examples/intro.md` that doubles as the test fixture and README demo, exercising every splitter rule (`---` separators, top-level `#` headings, fenced code blocks for `cli-highlight`, lists, and inline emphasis).
- 6a7fde7: Refresh the `coding` template's starter ideas and fix recency-biased idea selection. NOTES.md now ships with three modern, immediately-runnable TypeScript seeds (a terminal weather card via Open-Meteo, a markdown slide deck built on Ink, and a Carbon-style code screenshot generator using shiki + sharp) instead of the previous five utilitarian CLIs. The `build-project` workflow now seeds a random integer into spec-creator, which picks the unbuilt idea at `random_pick mod N` rather than the LLM's subjective notion of "most compelling" - removing the bug where the agent reliably chose the last item in NOTES.md. The post-install message in the manifest is updated to match.
- 72661af: Enforce tools[] restrictions for full-permission agents. Previously the runner ignored the tools[] array under permissions: 'full', silently disabling any declared restriction; it now emits --allowedTools alongside --dangerously-skip-permissions.
- 08feeae: Throw `EnvProfileError` from `runWorkflow` instead of calling `process.exit(1)`. Lets CLI, tests, and library consumers decide how to handle the error.
- 3923f4c: Mark failed workflow steps with ✗ in the per-step CLI output. Previously a step whose agent exited non-zero still rendered with a green tick, even though the workflow summary correctly reported FAILED.
- dbf8a37: Fix workflow step output printing `↳ undefined <model>` instead of the agent name. The registry's TypeScript loader was creating a fresh module graph per call, so an agent imported transitively by a workflow file was a different object than the one loaded directly into the registry - the name mutation only landed on one copy. Switched to Node's regular `import()` so both references share the ESM cache.
- 8f3b029: Run oxfmt across the codebase to baseline formatting against the formatter's defaults. No functional change; pure source reflow.
- 0a7d248: Show raw token counts under 1000 in logs instead of rounding to "0k tok". Small steps now report e.g. "543 tok"; counts ≥ 1000 keep the existing "Nk tok" format.
- c5daf72: Render engine bin invocations (emit, verdict, params) in plain English in verbose stream output instead of raw `Bash: /abs/path/bin/... --flag "..."` lines. Now shows e.g. `Halted with reason: "..."`, `Verdict: approve`, `Outputs emitted: spec_filepath="..."`, so it's clearer what the agent actually did.
- 049eb77: Colour only the ✓/✗ glyph in step-done logs. Id, duration, tokens, cost, and model now render in the default colour to reduce visual noise.
- a4530f9: Replace hardcoded /tmp paths with os.tmpdir() for cross-platform portability. Engine and agent-runner now work on Windows and systems with non-POSIX temp directories.
- ee7a67d: Harden subprocess handling for hung agents and missing critic verdicts. Adds a SIGKILL backstop 10s after a timed-out agent's SIGTERM so a non-responsive Claude CLI can no longer block the parent run, and retries the critic step (up to `maxRetries`) when it returns no verdict instead of halting on the first transient miss.
- 9055c29: Fix `[object Object]` rendering in `generata help templates`. The catalog format moved to `{ url, subdir }` objects but the help command was still typing entries as plain strings; now destructures the fields and prints `<url>  (<subdir>)`.
- 8b99c85: Fix: flatten nested workflow names in slash command generation. Workflows under nested paths now generate commands with just the basename instead of namespaced paths, and collision detection prevents duplicate command names.
- e6543ad: Prevent sub-agents from recursively invoking their own workflow. Generated slash commands matching an agent's task description (via `generata skills sync`) combined with global "always invoke skills" directives caused agents to launch the workflow they were already inside. The role prefix now forbids skill/sub-agent invocation, and the engine throws on `metrics.status="failure"` so missing-outputs surface clearly instead of crashing downstream steps.
- 60723c4: Place `outputs` at the bottom of agent definitions, after `promptTemplate`. Convention only - no behavioural change. The prompt is what the author writes; the outputs are the contract for the next step. Reading top-to-bottom: type/description/model/tools/timeout, then prompt, then "and here is what flows out".
- 90b1c88: Parse --key=value syntax and reject flag-shaped values. Internal CLI fix with no public API surface changes.
- 40fada7: Pin packageManager in scaffolded package.json. Reads the invoking PM/version from npm_config_user_agent so freshly initialised projects don't trigger a Corepack `latest` download prompt.
- 4051102: Randomise the workflow start tagline. Replaces the static "Let's get to work." banner with a randomly picked tagline so consecutive runs feel a bit livelier, matching the existing per-agent tagline behaviour.
- 2e102aa: Enable logPrompts by default in scaffolded config. New projects from `generata init` get prompt logs on out of the box; the schema default stays off.
- 038b0da: Skip underscore-prefixed files and directories in the agent loader so shared helpers (e.g. `agents/_out-of-scope.ts`) coexist with agent files without tripping the kebab-case path validator.
- 232d3c4: `generata skills sync` now writes slash-command bodies that invoke the workflow shorthand (`pnpm generata <name>`) instead of the long form. Existing `.claude/commands/<name>.md` files are regenerated on next sync.
- 6f67c8e: Align starter template docs with the flat `agents/` layout. The workflow ships as `agents/hello.ts`, but the templates README, starter README, and starter manifest's `postInstall` still pointed at the old `agents/workflows/hello.ts` path - users following the docs hit a non-existent file. Tables also reflowed for consistent column alignment.
- f9982f1: Fix: quote and escape values in writeDotEnv to prevent malformed .env files when prompted values contain special characters.

## 1.1.1

### Patch Changes

- 07f2c36: Fix `generata init` failing with ERR_MODULE_NOT_FOUND for `tsx` when run via `pnpm dlx` from a directory that doesn't have tsx in scope. The bin now resolves the tsx loader via an absolute file URL.

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
