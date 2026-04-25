# `init` works in non-empty directories

## Problem

Two CLI errors form a circular loop:

```
$ generata init @generata/coding .
[error] Destination /…/generata-test already has files. Use 'generata add' to merge into an existing project.

$ generata add @generata/coding .
[error] No generata.config.ts found … Run 'generata init' to scaffold one …
```

A user with an existing project directory (no `generata.config.ts` yet) cannot get out of this loop.

## Decision

Make `init` tolerant of non-empty destination directories. The `add` command stays as-is - its error correctly points to `init`, which now works.

## Changes (in `packages/core/src/cli/init.ts`)

1. **Drop the non-empty-dir guard.** Remove the `hasUserContent(destAbs)` check (lines 25-29) and the `hasUserContent` helper (lines 111-115). `init` proceeds in any directory.

2. **Template-file copy gains `add`-style conflict handling.** Today `init`'s copy step (lines 75-87) unconditionally overwrites. Change it to error on existing files unless `--force` is passed, mirroring `runAdd`'s semantics. `--dry-run` already exists on `add`; add it to `init` too for symmetry.

3. **Idempotent scaffolding.**
   - `package.json`: already idempotent (line 232 returns early if it exists). No change.
   - `.env`: env prompt already loads existing `.env` values (line 69). Keep as-is — keys already present in `.env` are pre-filled, so the user can skim through.

4. **Flags.** `init` accepts `--force` (overwrite conflicts) and `--dry-run` (list files that would be written).

## Out of scope

- No changes to `add`. Its "no project root" error message already says "Run 'generata init' to scaffold one", which is now accurate.
- No changes to the `findProjectRoot` error.
- No new commands.

## Result

| Scenario | Before | After |
| --- | --- | --- |
| Empty dir, `init` | works | works |
| Non-empty dir, no config, `init` | errors → loop | works |
| Non-empty dir with config, `init` | errors → loop | works (treats as merge) |
| Non-empty dir, no config, `add` | errors | errors (correctly points at `init`) |
| File conflict during `init` copy | silently overwrites | errors unless `--force` |

## Tests

- Existing `find-project-root.test.ts` and friends should continue to pass.
- Add a test in `packages/core/src/cli/` that runs `init` against a directory containing a stray file (e.g. `existing.txt`) and asserts:
  - The stray file is preserved.
  - `generata.template.json`-driven files are written.
  - A conflict on a template-owned file errors without `--force`, succeeds with `--force`.
