# generata

[![npm](https://img.shields.io/npm/v/%40generata%2Fcore?logo=npm&label=%40generata%2Fcore)](https://www.npmjs.com/package/@generata/core)
[![CI](https://img.shields.io/github/actions/workflow/status/ben-rogerson/generata/ci.yml?branch=main&logo=github&label=CI)](https://github.com/ben-rogerson/generata/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/%40generata%2Fcore)](./LICENSE.md)

Multi-agent pipelines for Claude Code. Define agents, wire them into workflows, run them. No API key needed.

## Try it

For a "one-agent, one-workflow starter", run:

```bash
pnpm dlx @generata/core init @generata/starter ~/Projects/hello-generata
# or: npx @generata/core init @generata/starter ~/Projects/hello-generata
cd ~/Projects/hello-generata
pnpm generata hello --message "world"
```

The `init` command above scaffolds the project, asks for any env values, and writes Claude Code slash commands for every workflow it finds.

If you want the full plan-driven coding pipeline, initialize [`@generata/coding`](./packages/templates/coding) (or add it to an existing project with `pnpm generata add @generata/coding`).

## What an agent looks like

`defineAgent` takes a factory function: declare the agent's typed inputs, get them back inside the closure, interpolate them into the prompt.

```ts
// agents/greeter.ts
import { defineAgent } from "@generata/core";

export default defineAgent<{ message: string }>(({ message }) => ({
  type: "worker",
  description: "Greets a message in one creative line.",
  modelTier: "light",
  permissions: "read-only",
  tools: [],
  promptTemplate: `Greet "${message}" in one creative line.`,
}));
```

And a workflow that uses it. Workflows live under `agents/` (flat) or `agents/workflows/` (nested) - the filename is the workflow name. The starter uses flat; most templates use the nested convention.

```ts
// agents/hello.ts  (or agents/workflows/hello.ts)
import { defineWorkflow } from "@generata/core";
import greeter from "./greeter.js";

export default defineWorkflow({
  description: "Greets the supplied message.",
  required: ["message"],
})
  .step("greet", ({ message }) => greeter({ message }))
  .build();
```

And the project config - `init` writes one for you, but here's what it looks like:

```ts
// generata.config.ts
import { defineConfig } from "@generata/core";

export default defineConfig({
  modelTiers: {
    heavy: "claude-opus-4-7",
    standard: "claude-sonnet-4-6",
    light: "claude-haiku-4-5",
  },
});
```

That's the whole API surface for most use cases - `defineAgent`, `defineWorkflow`, `defineConfig`. No decorators, no plugin system, no DI container.

## Passing values between steps

Agents declare typed `outputs`. Downstream steps destructure them in their stepFn with full type-safety. No parsing, no fenced JSON blocks, no text sentinels - the chain builder threads each agent's output keys into the next step's params.

```ts
// agents/spec-creator.ts
import { defineAgent } from "@generata/core";

export default defineAgent<{ output_dir: string }>(({ output_dir }) => ({
  type: "worker",
  description: "Picks an idea, writes SPEC.md, returns the absolute path.",
  modelTier: "standard",
  permissions: "full",
  tools: ["write", "bash"],
  outputs: {
    spec_filepath: "Absolute path to the SPEC.md file you wrote",
    instructions: "2-4 sentence summary of what to build",
  },
  promptTemplate: `
Pick an idea from NOTES.md and write the spec under ${output_dir}/<slug>/SPEC.md.

If no unbuilt ideas exist, halt with reason "no unbuilt ideas in NOTES.md".
`,
}));
```

```ts
// agents/plan-creator.ts
import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string; instructions: string }>(
  ({ spec_filepath, instructions }) => {
    const plan_filepath = spec_filepath.replace(/\/SPEC\.md$/, "/PLAN.md");
    return {
      type: "planner",
      description: "Reads SPEC.md, writes PLAN.md alongside it",
      modelTier: "standard",
      permissions: "full",
      tools: ["write"],
      outputs: { plan_filepath: "Absolute path to PLAN.md" },
      promptTemplate: `
Read the spec at: ${spec_filepath}
Write the plan to: ${plan_filepath}

Your task: ${instructions}
`,
    };
  },
);
```

```ts
// agents/workflows/build.ts
import { defineWorkflow } from "@generata/core";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import codeWriter from "../code-writer.js";

export default defineWorkflow({
  description: "Spec it, plan it, build it.",
  variables: { output_dir: "projects" },
})
  .step("dream", ({ output_dir }) => specCreator({ output_dir }))
  // spec_filepath + instructions arrived from spec-creator's `outputs`,
  // typed via the chain builder. plan_filepath shows up after `plan` runs.
  .step("plan", ({ spec_filepath, instructions }) =>
    planCreator({ spec_filepath, instructions }),
  )
  .step("build", ({ spec_filepath, plan_filepath }) =>
    codeWriter({ spec_filepath, plan_filepath }),
  )
  .build();
```

Each `.step()` destructure is fully typed. Typo a key, reference a value before the step that emits it, miss a required input - all type errors at the call site. Halt at any agent with `halt with reason "X"` and the engine stops the workflow cleanly; downstream steps don't run.

For workflows that mutate the repo and ship a PR, opt in to git-worktree isolation via `worktree`. The workflow runs in a fresh worktree branched from `origin/main`, while logs, metrics, and any declared `sharedPaths` symlink back to the main checkout. Pruned at run end:

```ts
import { defineWorkflow, worktree } from "@generata/core";

export default defineWorkflow({
  description: "Self-improve loop",
  isolation: worktree({
    sharedPaths: ["IMPROVEMENTS.md", "last-run.md"],
  }),
})
  .step(/* ... */)
  .build();
```

Run-time overrides: `generata workflow <name> --worktree` forces isolation on, `--local` forces it off. `generata worktree prune` recovers orphan worktrees from crashed runs.

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

| Package                                                      | What it is                                              |
| :----------------------------------------------------------- | :------------------------------------------------------ |
| [`packages/core`](./packages/core)                           | `@generata/core` - the engine and CLI, published to npm |
| [`packages/templates/coding`](./packages/templates/coding)   | The default coding pipeline template, cloned by `init`  |
| [`packages/templates/starter`](./packages/templates/starter) | Minimal starter for building your own pipeline          |
| [`packages/templates/standup`](./packages/templates/standup) | Daily standup summariser template                       |

---

Built by [Ben Rogerson](https://benrogerson.dev).
