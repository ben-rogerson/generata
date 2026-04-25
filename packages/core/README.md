# @generata/core

Composable multi-agent pipelines on top of the Claude Code CLI.

```bash
npm i -g @generata/core
generata init <template> ~/path/to/new-project
```

## Public API

```ts
import { defineAgent, defineWorkflow, defineConfig } from "@generata/core";
```

That's all you need to author agents, workflows, and a project config.

## CLI

| Command                            | Purpose                                                       |
| :--------------------------------- | :------------------------------------------------------------ |
| `generata init <template> [dest]`  | Scaffold a new project from a template                        |
| `generata add <template>`          | Merge a template into the current project                     |
| `generata agent <name>`            | Run a single agent                                            |
| `generata workflow <name>`         | Run a workflow (alias: `run`)                                 |
| `generata validate [--all]`        | Static-check workflow definitions                             |
| `generata metrics [today\|week]`   | Show metrics summary                                          |
| `generata skills sync`             | Regenerate `.claude/commands/` from workflows                 |
| `generata help [topic]`            | Show help (topics: agents, workflows, env, templates, bins)   |

## Template specifiers

`generata init` accepts:

- `@generata/<alias>` - resolves via the built-in catalog
- `<owner>/<repo>` - resolves to `https://github.com/<owner>/<repo>.git`
- `git@...` / `https://....git` - any git URL
- `./path` / `/abs/path` - a local directory containing `generata.template.json`

## Init flags

- `--yes` - non-interactive; required env values default to manifest examples
- `--skip-preflight` - skip required-bin checks
- `--skip-install` - skip the package-manager install step (useful offline)

## Add flags

- `--force` - overwrite conflicting files
- `--dry-run` - print what would be written
- `--into <subdir>` - merge into a subdirectory rather than the project root

## Development (in the ApexGen monorepo)

```bash
pnpm install                            # links the workspace
pnpm --filter @generata/core build      # rebuild dist/ after engine changes
node --test --import tsx generata/src/**/*.test.ts
```

The exports map uses a `development` condition that points at `src/` so workspace dev runs through the TypeScript source via tsx; published consumers see the compiled `dist/` output.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.
