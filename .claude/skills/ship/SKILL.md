---
name: ship
description: Use when the user wants to ship completed work in the generata monorepo - turning the current diff into a branch, commit, push, PR, and matching changeset.
---

# Ship

Run the canonical generata "branch + commit + push + PR + changeset" sequence in one go. Project-specific - lives in this repo and follows the rules in `AGENTS.md`.

## When to use

- User invokes `/ship` after Claude has made changes
- User says "ship it", "open a PR for this", or similar after work is complete

## When NOT to use

- Mid-task, before changes are validated
- For changes that should not become a PR (e.g. exploratory edits the user will revert)
- Outside the generata repo (commands and changeset rules are project-specific)

## Steps

Run in order. Halt and surface errors at any failure - never push broken or partial work.

### 1. Preflight

```bash
git status
git diff
git log @{u}..HEAD 2>/dev/null  # unpushed commits, if any
```

If working tree is clean AND no unpushed commits, bail with: "Nothing to ship."

### 2. Type-check + test

```bash
pnpm typecheck && pnpm test
```

If either fails, halt. Report the error. Do not push.

### 3. Branch from latest main (if currently on main)

```bash
git rev-parse --abbrev-ref HEAD  # check current branch
```

If on `main`:

```bash
git stash --include-untracked   # only if working tree is dirty
git pull --ff-only origin main  # fail loud if main has diverged
git checkout -b <type>/<short-description>
git stash pop                   # only if stashed above
```

Derive `<type>/<short-description>` from the diff:
- Type ∈ `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci` (per AGENTS.md)
- Description: 2-4 kebab-case words, present tense, what the change does

If already on a feature branch, reuse it. Do not pull (would risk surprise merges into in-progress work).

### 4. Stage explicit paths

Never `git add -A` or `git add .`. Stage only files that match the change. Skip:
- `.env`, `.env.*`
- Anything under `dist/`, `node_modules/`
- Anything under `docs/superpowers/` (planning / brainstorming artefacts - local only, gitignored)
- Files that look like secrets (credentials, tokens)
- Unrelated changes in the working tree (announce these and ask before staging)

### 5. Commit

Conventional commit title (`<type>: <subject>`). Body via HEREDOC. Never `--no-verify`.

```bash
git commit -m "$(cat <<'EOF'
<type>: <subject>

<optional body explaining why, not what>
EOF
)"
```

If a pre-commit hook fails: fix the underlying issue, re-stage, and create a new commit. Never `--amend` (per AGENTS.md).

### 6. Changeset (auto-detect bump)

Pick `patch`, `minor`, or skip:

| Trigger | Bump |
|---------|------|
| Touched `packages/core/src/define.ts` (public API surface) | `minor` |
| Added new CLI flag, command, or template under `packages/templates/` | `minor` |
| Bug fix, refactor, internal cleanup, doc tweak inside `packages/` | `patch` |
| Only `.github/`, `test/fixtures/`, root `*.md`, or `.changeset/` itself | skip |

Check for an existing changeset on this branch:

```bash
git diff --name-only origin/main..HEAD -- .changeset/ | grep -v config.json
```

If output is non-empty, a changeset already exists - skip step 6 entirely.

Otherwise write `.changeset/<kebab-summary>.md`:

```markdown
---
"@generata/core": <patch|minor>
---

<one-line summary mirroring the commit subject, then a sentence on why>
```

Commit as a separate commit so it's reviewable in isolation:

```bash
git add .changeset/<kebab-summary>.md
git commit -m "chore: add changeset"
```

Announce the bump tier so the user can override if wrong.

### 7. Push

```bash
git push -u origin <branch>
```

### 8. PR

Check for an existing open PR:

```bash
gh pr view --json number 2>/dev/null
```

If none exists, create one:

```bash
gh pr create --title "<conventional-commit-title>" --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [ ] <manual verification step, if relevant>
EOF
)"
```

Do NOT pass `--auto` or run `gh pr merge` - user reviews and merges manually.

Print the PR URL.

## Edge cases

| Situation | Action |
|-----------|--------|
| Pre-commit hook fails | Fix root cause, re-stage, new commit. Never `--no-verify` or `--amend`. |
| Mixed/unrelated changes in working tree | List intended files. Ask before staging. |
| Branch already has open PR | Push commits to existing PR. Skip `gh pr create`. |
| `pnpm typecheck` or `pnpm test` fails | Surface error. Halt. Do not push. |
| Local main has diverged from origin/main | Halt. Ask user how to reconcile. |
| No changes at all | Bail with "Nothing to ship." |

## Common mistakes

- **Auto-merging.** Never. User merges manually.
- **`git add -A`.** Never. Stage by path.
- **`--amend` after hook failure.** Never. The previous commit didn't include the failed work, so amend would corrupt it. Always new commit.
- **Major bump.** This skill never picks `major`. If a change really is breaking, halt and ask the user to handle it manually.
- **Skipping the changeset commit when one is needed.** The changeset is part of the change - it ships in the same PR.
