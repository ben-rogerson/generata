# self-improve

A small generata project that scans the parent repo, picks the most worthwhile improvement, and ships it. It is generata applied to generata.

## Workflows

Two workflows. `audit` walks the codebase and writes findings to `IMPROVEMENTS.md` (local-only, gitignored). `improve` picks the highest-priority finding, writes a spec, writes a plan, writes the code, and reviews itself. Shipping (branch, commit, changeset, push, PR) is deterministic code, not an agent: `scripts/loop.ts` calls `runShipper` from `scripts/ship.ts` after the workflow succeeds. Running the workflow directly (`generata workflow improve`) leaves the diff stranded in its worktree - nothing ships.

## Usage

```bash
pnpm self-improve:audit       # scan, append findings to IMPROVEMENTS.md
pnpm self-improve:improve     # ship the top finding (loop.ts --max 1)
pnpm --filter @generata/self-improve loop   # keep shipping until the backlog drains (--max 16 default)
```

Read `IMPROVEMENTS.md` between the two. Read `last-run.md` after the second to see what shipped.

`improve:pipeline-only` runs the bare workflow without shipping - debugging only.

## Guardrails

The `code-writer` will not touch `.changeset/`, `.github/workflows/`, this folder, the root `package.json`, `pnpm-workspace.yaml`, the lockfile, or any `.env`. If a fix would touch one of those, the writer halts the workflow with a structured reason and leaves the entry in the queue. Those changes are done by hand.
