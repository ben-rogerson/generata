# generata

[![npm](https://img.shields.io/npm/v/%40generata%2Fcore?logo=npm&label=%40generata%2Fcore)](https://www.npmjs.com/package/@generata/core)
[![CI](https://img.shields.io/github/actions/workflow/status/ben-rogerson/generata/ci.yml?branch=main&logo=github&label=CI)](https://github.com/ben-rogerson/generata/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/%40generata%2Fcore)](./LICENSE.md)

Multi-agent pipelines for Claude Code. Define agents, wire them into workflows, run them. No API key needed.

## Try it

```bash
npm i -g @generata/core
generata init @generata/starter ~/Projects/hello-generata
cd ~/Projects/hello-generata
generata workflow hello --message "world"
```

That's a one-agent, one-workflow starter. `init` scaffolds the project, asks for any env values, and writes Claude Code slash commands for every workflow it finds. When you want the full plan-driven coding pipeline, swap `@generata/starter` for [`@generata/coding`](./packages/templates/coding).

## What an agent looks like

```ts
// agents/echo.ts
import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Repeats whatever message it receives.",
  modelTier: "light",
  permissions: "read-only",
  tools: [],
  promptTemplate: ({ message }) => `Repeat this back exactly: ${message}`,
});
```

And a workflow that uses it. Workflows can live anywhere under `agents/`. The filename is the workflow name.

```ts
// agents/say-hello.ts
import { defineWorkflow } from "@generata/core";
import echo from "./echo.js";

export default defineWorkflow({
  description: "Echoes the supplied message.",
  required: ["message"],
  steps: [{ id: "echo", agent: echo }],
});
```

That's the whole API surface for most use cases - `defineAgent`, `defineWorkflow`, `defineConfig`. No decorators, no factories, no plugin system.

## What you get

- **Composable agents** - planners, workers, critics. Mix and match.
- **Heavy/standard/light tiers** - each agent declares the tier it needs; you map tiers to actual models once in `generata.config.ts`. Swap a whole pipeline from Opus to Haiku by editing three lines.
- **Workflows as graphs** - steps run in parallel where they can; critics can retry an upstream step on rejection.
- **Runs on the Claude Code CLI you already have** - no separate API key, no provider config.
- **Zod-validated** end to end. Bad configs and bad step args fail loud at the edges.
- **Metrics included** - cost, tokens, and duration per agent and per workflow, out of the box.
- **Prompt logs on demand** - flip `logPrompts: true` (or pass `--log-prompts`) and every prompt sent to Claude Code lands in `logs/` so you can replay, diff, or debug what an agent actually saw.
- **Work/personal env profiles** - pass `--profile work` and required env keys are pulled from `WORK_`-prefixed vars, so the same pipeline can run against a work GitHub token one minute and your personal one the next without `.env` shuffling.

## Why?

Most agent frameworks expect you to manage Anthropic/OpenAI API keys, juggle Python environments, or wire up a runtime that knows how to spawn subagents. generata shells every step out to the Claude Code CLI you already have signed in - so the only runtime is the one you've been using all along. The engine is small, TypeScript-first, and treats critic-retry loops and parallel DAG execution as first-class.

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

---

Built by [Ben Rogerson](https://benrogerson.dev).
