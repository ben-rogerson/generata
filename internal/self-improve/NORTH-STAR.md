# Generata North Star

This document tells the feature dreamer (and any human reading it) where
generata is heading and what areas are worth exploring next. Edit it when
thinking shifts.

## Principles

- **Programmatic-first over CLI UX.** The CLI is a thin wrapper around a
  typed library surface. Library ergonomics and composability outrank flag
  ergonomics. New surface should be callable from code before it's wired
  into a command.

- **Typed outputs over prose.** Agents that declare structured `outputs`
  compose cleanly - downstream steps get typed params, no parsing, no
  sentinels. Agents that emit prose require a reader. Any new agent
  pattern should prefer the former.

- **Halt-on-uncertainty over guess-and-recover.** When an agent hits a
  decision it can't resolve from context, the right move is to stop and
  surface a structured reason, not pick a plausible path and continue.
  Silent drift is harder to debug than a loud halt.

- **Small surface over rich framework.** The pitch is `defineAgent`,
  `defineWorkflow`, `defineConfig` - three exports for most use cases. No
  decorators, no DI container, no plugin registry. New abstractions should
  justify the weight. Prefer composing existing primitives over adding a
  new one.

- **Local-first over cloud-dependent.** Generata runs on the Claude Code
  CLI the user already has. No separate API key, no managed cloud runtime.
  Features that require an external service should be opt-in and
  self-hostable.

## Themes

### Runtime observability

What an operator sees while a workflow runs - and after it crashes. Metrics
exist (JSONL) but are post-mortem. Room to add live progress and structured
halt reasons surfaced to the caller.

### Workflow composition primitives

The core chain is linear. Real pipelines branch, gate, and retry. Ideas
here: conditional steps, human-approval gates, nested workflows as steps,
resume-from-failure, replay from a recorded run. Each should compose without
touching engine internals.

### Testing and evaluation

Devs writing workflows today burn real LLM calls or hand-roll stubs - no
shared test harness exists. This theme covers mock agents, fixture recording,
eval harnesses for model-swap regressions, and dry-run modes.

### Programmatic API ergonomics

Code that orchestrates generata from a script today has to piece together
boilerplate (abort controllers, error handling, run lifecycle). A thin
`@generata/runtime` or helper module could close that gap without bloating
core.

### Multi-repo and cross-boundary orchestration

Worktree isolation works for one repo. A workflow that spans several
repositories (coordinating a breaking-API rollout across producer and
consumers) has nowhere to land today. Under-explored; no other tool in this
space handles it either.

### Observability and cost governance

Per-workflow cost budgets, concurrency/rate-limit helpers, and timeout
warnings are adjacent to runtime observability but distinct - they're about
managing spend and load, not just visibility. Worth treating as its own
theme because the surface (budget config, limit DSL) lands in defineWorkflow.
