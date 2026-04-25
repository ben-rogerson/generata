# generata

[![npm](https://img.shields.io/npm/v/%40generata%2Fcore?logo=npm&label=%40generata%2Fcore)](https://www.npmjs.com/package/@generata/core)
[![CI](https://img.shields.io/github/actions/workflow/status/ben-rogerson/generata/ci.yml?branch=main&logo=github&label=CI)](https://github.com/ben-rogerson/generata/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/%40generata%2Fcore)](./LICENSE.md)

Multi-agent pipelines for Claude Code. Define agents, wire them into workflows, run them. No API key needed.

## Try it

```bash
npm i -g @generata/core
generata init @generata/coding ~/Projects/my-pipeline
cd ~/Projects/my-pipeline
generata workflow daily-plan
```

Done. `init` scaffolds the project, asks for any env values, and writes Claude Code slash commands for every workflow it finds.

## What you get

- **Composable agents** - planners, workers, critics, supervisors. Mix and match.
- **Workflows as graphs** - steps run in parallel where they can; critics can retry an upstream step on rejection.
- **Runs on the Claude Code CLI you already have** - no separate API key, no provider config.
- **Zod-validated** end to end. Bad configs and bad step args fail loud at the edges.
- **Metrics included** - cost, tokens, and duration per agent and per workflow, out of the box.

## Packages

| Package | What it is |
| :--- | :--- |
| [`packages/core`](./packages/core) | `@generata/core` - the engine and CLI, published to npm |
| [`packages/templates/coding`](./packages/templates/coding) | The default coding pipeline template, cloned by `init` |
| [`packages/templates/starter`](./packages/templates/starter) | Minimal starter for building your own pipeline |
| [`packages/templates/standup`](./packages/templates/standup) | Daily standup summariser template |

## Hack on it

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run the CLI without building:

```bash
node --import tsx packages/core/src/cli.ts help
```

Scaffold from the local template into a temp dir:

```bash
TMP=$(mktemp -d)
node --import tsx packages/core/src/cli.ts init ./packages/templates/coding "$TMP" --yes --skip-install
```

See [AGENTS.md](./AGENTS.md) for the full development guide.

## Release

We use [Changesets](https://github.com/changesets/changesets). Add one with `pnpm changeset`, merge to `main`, and the release workflow opens a version PR. Merge that PR to publish.

## License

ISC
