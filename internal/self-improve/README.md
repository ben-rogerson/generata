# self-improve

A small generata project that scans the parent repo, picks the most worthwhile improvement, and ships it. It is generata applied to generata.

## Workflows

Two workflows. `audit` walks the codebase and writes findings to `IMPROVEMENTS.md` (local-only, gitignored). `improve` picks the highest-priority finding, writes a spec, writes a plan, writes the code, reviews itself, and ships the result via the `/ship` skill - branch, commit, changeset, push, PR.

## Usage

```bash
pnpm self-improve:audit       # scan, append findings to IMPROVEMENTS.md
pnpm self-improve:improve     # ship the top finding
```

Read `IMPROVEMENTS.md` between the two. Read `last-run.md` after the second to see what shipped.

## Guardrails

The `code-writer` will not touch `.changeset/`, `.github/workflows/`, this folder, the root `package.json`, `pnpm-workspace.yaml`, the lockfile, or any `.env`. If a fix would touch one of those, the writer halts the workflow with a structured reason and leaves the entry in the queue. Those changes are done by hand.
