# Ship skill design

A project-level Claude Code skill that automates the AGENTS.md "branch + commit + push + PR + changeset" workflow for the generata monorepo.

## Goal

Replace the current ad-hoc "new branch, push, MR, changeset" sequence with a single explicit invocation: `/ship`.

## Non-goals

- Auto-merging PRs (out of scope; user reviews and merges manually).
- Auto-running for every change (skill is explicit-only - no hooks, no after-task triggers).
- Reuse across other projects (this lives in the repo; cross-project version is a future user-level skill).
- Handling major version bumps (intentionally constrained to `patch` and `minor`).

## Location

`.claude/skills/ship/SKILL.md` - committed to the repo so it ships alongside AGENTS.md and applies to anyone working in this codebase with Claude Code.

## Trigger

User types `/ship`. No arguments. The skill instructs Claude to derive everything (branch name, commit message, changeset content, PR title and body) from the current diff and conversation context.

## Steps

The skill instructs Claude to run, in order:

1. **Preflight.** Run `git status` and `git diff`. If working tree is clean and there are no unpushed commits on the current branch, bail out with a message.

2. **Type-check + test.** Run `pnpm typecheck && pnpm test`. Halt on failure - never push broken code.

3. **Branch from latest main (if on main).** If `git rev-parse --abbrev-ref HEAD` is `main`:
   - `git stash` if working tree is dirty.
   - `git pull --ff-only origin main`. Fail loud if local main has diverged - that's a signal to investigate, not auto-merge.
   - Derive a branch name `<type>/<short-description>` from the diff (`type` ∈ feat, fix, chore, docs, refactor, test, ci per AGENTS.md).
   - `git checkout -b <branch>`.
   - `git stash pop` if stashed.

   If on an existing feature branch, reuse it. Do not pull - would risk surprise merges into in-progress work.

4. **Stage explicit paths.** Never `git add -A` or `git add .`. Stage only files that match the change. Skip `.env`, anything under `dist/`, anything matching gitignore patterns.

5. **Commit.** Title in conventional-commit format (`<type>: <subject>`). Body via HEREDOC. Never `--no-verify`. If a pre-commit hook fails, fix the underlying issue, re-stage, and create a new commit (per AGENTS.md - never `--amend`).

6. **Changeset (auto-detect bump).**
   - **patch** (default) - bug fixes, refactors, internal cleanup, doc tweaks inside packages.
   - **minor** - touching `packages/core/src/define.ts`, adding a CLI flag/command, adding a new template under `packages/templates/`.
   - **skip entirely** - changes only to `.github/`, `test/fixtures/`, `*.md` outside `packages/`, or other non-release-worthy files.

   Write to `.changeset/<kebab-summary>.md` with the standard frontmatter, summary, and reason. Detect existing changesets via `git diff --name-only origin/main..HEAD -- .changeset/` - if any new changeset is already on the branch, skip this step. Stage and create a separate `chore: add changeset` commit so it's reviewable in isolation.

7. **Push.** `git push -u origin <branch>`.

8. **PR.** If no open PR for the branch (`gh pr view --json number 2>/dev/null`), create one with `gh pr create --title "<conventional>" --body "<summary + test plan via HEREDOC>"`. Print the URL. No auto-merge.

   If a PR already exists, just push the new commits.

## Edge cases

- **Pre-commit hook failure.** Fix root cause, re-stage, new commit. Never `--no-verify`.
- **Mixed/unrelated changes in working tree.** Skill announces what it plans to stage and asks before continuing.
- **Branch has open PR already.** Push commits to the existing PR; skip `gh pr create`.
- **`pnpm typecheck` or `pnpm test` fails.** Surface the error and halt. Do not push.
- **No changes at all.** Bail with a friendly message.

## Frontmatter

```yaml
---
name: ship
description: Ship the current changes - branch from latest main, commit, push, open a PR, and add a matching patch/minor changeset. Use when work is done and ready to merge.
---
```

## Out-of-band: AGENTS.md update

After the skill is in place, add a one-liner to AGENTS.md pointing at it: "To ship a change: invoke `/ship` (Claude Code) - it runs the canonical branch/commit/push/PR/changeset sequence."
