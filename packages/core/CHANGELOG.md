# @generata/core changelog

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
