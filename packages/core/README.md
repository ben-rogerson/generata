# @generata/core

Composable multi-agent pipelines on top of the Claude Code CLI.

```bash
npx @generata/core init @generata/starter ~/Projects/hello-generata
# or: pnpm dlx @generata/core init @generata/starter ~/Projects/hello-generata
```

## Public API

```ts
import {
  defineAgent,
  defineWorkflow,
  defineConfig,
  runWorkflow,
  runAgent,
  worktree,
} from "@generata/core";
```

`defineAgent` / `defineWorkflow` / `defineConfig` author agents, workflows, and a project config. `runWorkflow` / `runAgent` drive them from your own TypeScript without going through the CLI. `worktree(...)` declares git-worktree isolation:

```ts
defineWorkflow({
  isolation: worktree({ sharedPaths: ["state.md"] }),
  // ...
});
```

## Running workflows from code

`@generata/core` exposes `runWorkflow` and `runAgent` so you can drive any workflow or agent from your own TypeScript without going through the CLI. This is the primitive for loops, batch jobs, or wrapping generata in a larger script.

### Basic call

```ts
import { runWorkflow } from "@generata/core";
import reviewNote from "./workflows/review-note.js";

const result = await runWorkflow(reviewNote, { file: "notes/aardvark.md" });
console.log(result.output);
if (!result.success) process.exit(1);
```

### Looping over a folder

```ts
import { glob } from "node:fs/promises";
import { runWorkflow } from "@generata/core";
import reviewNote from "./workflows/review-note.js";

for await (const file of glob("notes/*.md")) {
  const result = await runWorkflow(reviewNote, { file });
  if (!result.success) {
    console.error(`Failed on ${file}:`, result.steps.at(-1)?.output);
    continue;
  }
  console.log(`Reviewed ${file}: ${result.output}`);
}
```

### Sharing a single worktree across many runs

When a workflow declares `isolation: worktree(...)`, every `runWorkflow` call by default sets up and tears down its own worktree. If you want one shared worktree across an iteration, set it up yourself, pass `isolation: "none"` to disable per-run setup, and point `cwd` at the worktree path:

```ts
import { runWorkflow } from "@generata/core";
import processItem from "./workflows/process-item.js";

// Replace with whatever produces a worktree path - your own helper, an
// existing checkout, etc. The point is: one path, many iterations.
const worktreePath = await setupSharedWorktree();

for (const item of items) {
  await runWorkflow(processItem, { id: item.id }, { isolation: "none", cwd: worktreePath });
}
```

### Subscribing to progress events

By default, programmatic runs are silent. Pass `onEvent` to receive structured events (workflow-start, step-start, step-done, etc.):

```ts
await runWorkflow(
  processItem,
  { id: "42" },
  {
    onEvent: (e) => {
      if (e.type === "step-done") process.stderr.write(".");
    },
  },
);
```

### Cancellation via `AbortSignal`

```ts
const ac = new AbortController();
process.once("SIGINT", () => ac.abort());
await runWorkflow(longRun, { input }, { signal: ac.signal });
```

### Error contract

`runWorkflow` throws for:

- `GenerataPrecheckError` - workflow misconfigured (introspect `err.issues` for diagnostics).
- `AbortError` - caller cancelled via `AbortSignal`.
- Infra errors (cannot spawn `claude`, etc.).

It returns `success: false` for:

- A step that hits its `maxRetries` limit. Inspect `result.steps.at(-1).output` and `result.steps.at(-1).metrics.error` for diagnostics.

It returns `halted: true, success: false` for:

- A worker that emits `--halt "<reason>"` via the emit bin. `result.haltReason` carries the reason; this is a clean structured stop, not a failure.

## CLI

| Command                           | Purpose                                                     |
| :-------------------------------- | :---------------------------------------------------------- |
| `generata <name>`                 | Run a workflow (shorthand for `workflow <name>`)            |
| `generata init <template> [dest]` | Scaffold a new project from a template                      |
| `generata add <template>`         | Merge a template into the current project                   |
| `generata agent <name>`           | Run a single agent                                          |
| `generata workflow <name>`        | Run a workflow (alias: `run`)                               |
| `generata validate [--all]`       | Static-check workflow definitions                           |
| `generata metrics [today\|week]`  | Show metrics summary                                        |
| `generata skills sync`            | Regenerate `.claude/commands/` from workflows               |
| `generata worktree prune`         | Remove orphan `generata/wt-*` worktrees and branches        |
| `generata help [topic]`           | Show help (topics: agents, workflows, env, templates, bins) |

Workflow flags: `--worktree` forces git-worktree isolation for the run; `--local` forces it off (mutually exclusive).

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
