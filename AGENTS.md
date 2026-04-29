# Generata development guide

This file is the canonical instruction set for AI coding agents (Claude Code, Cursor, Codex, Aider, etc.) working in this repo. It overrides any conflicting tool defaults. Read it before starting work.

If anything below conflicts with explicit instructions from the human in the current session, follow the human.

---

## Tech stack

- **Package manager:** pnpm 9.15.0 (pinned via `packageManager`). Never use npm or yarn.
- **Language:** TypeScript, run directly via `tsx` (no separate build step in the dev loop).
- **Runtime:** Node.js 22+.
- **Test runner:** built-in `node:test` via `node --test --import tsx`.
- **Lint:** oxlint. **Format:** oxfmt. (Not eslint, not prettier, not biome.)
- **Releases:** changesets. Versions and CHANGELOGs are bot-managed; do not edit them by hand.
- **Validation:** zod schemas at every boundary (manifests, configs).

---

## Repo layout

```
generata/
├── packages/
│   ├── core/                 # @generata/core - the published engine + CLI
│   └── templates/<name>/     # git-cloned templates (not published as npm packages)
├── .changeset/               # pending changesets, consumed by the release workflow
├── .github/workflows/        # ci.yml, release.yml
└── (root configs)
```

The engine's public API is exactly what `packages/core/src/define.ts` exports. Internals (engine, registry, runner, precheck, metrics) are not part of the public API and may change without a major bump.

---

## Branch and PR rules

- **Never push directly to `main`.** Branch protection enforces it; direct pushes will be rejected.
- Branch names follow `<type>/<short-description>`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`. Examples: `feat/init-flag`, `fix/resolver-subdir`, `chore/bump-deps`.
- One PR = one logical change. Don't mix unrelated edits.
- Merge style is **squash only**. The merge commit message defaults to the PR title — keep PR titles in conventional-commit format (`feat:`, `fix:`, etc.).
- Use `gh pr create --fill && gh pr merge --squash --auto` to push and queue auto-merge once CI passes.
- After merge, the source branch is auto-deleted by GitHub. Don't manually clean up.
- **Claude Code shortcut:** invoke `/ship` to run the full sequence (branch from latest main, commit, push, PR, matching `patch`/`minor` changeset). See `.claude/skills/ship/SKILL.md`.

---

## Per-change checklist

Before committing, run:

```bash
pnpm fmt && pnpm lint && pnpm typecheck && pnpm test
```

If you touched anything in `packages/core/src/`, also run:

```bash
pnpm build
```

If the change is **release-worthy** (anything a consumer of `@generata/core` would notice), also:

```bash
pnpm changeset
```

The interactive prompt asks for the package, the bump type, and a one-line summary. The summary becomes the CHANGELOG entry. Pick:

- **patch** — bug fixes, internal refactors, doc tweaks that don't change behaviour
- **minor** — new features, new flags, new exports
- **major** — breaking changes to the public API

Commit the generated `.changeset/<name>.md` file **with** the code change in the same PR. Don't add changesets in a separate "release" PR.

If the change is not release-worthy (CI tweaks, internal docs, test fixtures), skip the changeset.

---

## What NOT to do

- Do not run `npm install` or `yarn install`. Always `pnpm install`.
- Do not push to `main` directly under any circumstances.
- Do not edit version numbers in `packages/*/package.json` manually. The changeset workflow handles bumps.
- Do not edit `CHANGELOG.md` files manually. Changesets prepends entries.
- Do not add backwards-compatibility shims, deprecation comments, or feature flags for changes that haven't been released yet. Just edit the code.
- Do not introduce eslint, prettier, biome, jest, vitest, mocha, or other tooling that duplicates what's already here.
- Do not switch the bin (`packages/core/bin/generata`) from its current `node --import tsx` re-launch pattern unless the user explicitly asks.
- Do not invent template specifier syntax. The resolver supports: catalog aliases (`@generata/<name>`), GitHub short form (`<owner>/<repo>`), full git URLs, absolute/relative local paths.
- Do not run destructive git operations (`git reset --hard`, `git push --force`, `git branch -D`) without explicit user authorisation.

---

## Architectural conventions

- **Public API surface** is `packages/core/src/define.ts`. The exports map in `packages/core/package.json` enforces this. Anything else is internal.
- **Catalog entries** in `packages/core/templates.json` use the object form: `{ "url": "...", "subdir": "...", "ref": "..." }`. The plain-string form is supported for back-compat but new entries should use the object form for monorepo subdirs.
- **TypeScript loading at runtime:** the engine loads user `.ts` files (agent definitions, workflow definitions, project configs) via `loadTs()` from `packages/core/src/ts-loader.ts`. Never use bare `import()` for user files — `loadTs()` handles tsx's namespace double-wrap quirk.
- **Project root discovery:** the engine anchors on `generata.config.ts` (or `.mjs` / `.js`) via `findProjectRoot()`. Never assume `process.cwd()` or `__dirname` — always go through `findProjectRoot()`.
- **Test fixtures** live at `packages/core/test/fixtures/`. The `template-fake` fixture is exercised by the init smoke test; don't break its shape.
- **Templates are content, not packages.** Files under `packages/templates/<name>/` are not built, not bundled, not type-checked as part of the engine. They're copied verbatim by `init`.

---

## Common commands

```bash
# Test loop
pnpm test                                    # all tests once
pnpm test -- --watch                         # watch mode
node --test --import tsx packages/core/src/cli/manifest.test.ts  # single file

# Quick CLI try (uses tsx, no build needed)
node --import tsx packages/core/src/cli.ts help
node --import tsx packages/core/src/cli.ts init ./packages/templates/coding /tmp/foo --yes --skip-install

# Build artefacts (only when verifying the published-package path)
pnpm build
./packages/core/bin/generata help

# Pre-commit gauntlet
pnpm fmt && pnpm lint && pnpm typecheck && pnpm test

# Author a release-worthy change
pnpm changeset    # then commit alongside the code change
```

---

## When in doubt

- Read `packages/core/src/cli.ts` to see how commands dispatch.
- Read `packages/core/src/define.ts` for the public API shape.
- Read `packages/core/src/cli/init.ts` for the canonical multi-step CLI pattern.
- Read `.github/workflows/release.yml` for the release pipeline.
- Read `packages/templates/coding/generata.template.json` for a real template manifest example.
