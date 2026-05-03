# Templates

Templates are starter pipelines for [@generata/core](../core). They are not npm packages - they are folders of agents, workflows, and config that the `generata init` command copies into your project. After install, every file is yours to edit.

## TL;DR

- A template is a folder with a `generata.template.json` manifest and an `agents/` directory.
- `generata init <template> <dest>` resolves it (clone or local copy), installs deps, prompts for env vars, and writes `.claude/commands/` slash commands for every workflow it finds.
- Three templates ship in this repo: [`starter`](./starter), [`standup`](./standup), [`coding`](./coding).
- You can host your own anywhere git can reach (GitHub, GitLab, private mirror, local path).

## Install one of the built-ins

```bash
# Bare minimum - one agent, one workflow
pnpm dlx @generata/core init @generata/starter ~/Projects/hello

# Daily standup generator
pnpm dlx @generata/core init @generata/standup ~/Projects/standup

# Spec-driven coding pipeline (dream -> plan -> audit -> code -> review)
pnpm dlx @generata/core init @generata/coding ~/Projects/builder
```

`npx`, `bunx`, and `yarn dlx` work the same way. The catalog aliases above resolve via [`packages/core/templates.json`](../core/templates.json).

## What ships here

| Template               | Agents | Use it for                                                                                               |
| :--------------------- | :----- | :------------------------------------------------------------------------------------------------------- |
| [`starter`](./starter) | 1      | Smallest possible map - copy it, rename `greeter`, build out from there                                  |
| [`standup`](./standup) | 2      | Reads `git log`, drafts a 3-bullet standup. Replace the source agent to draft from JIRA, PRs, etc.       |
| [`coding`](./coding)   | 8      | Picks an idea from `NOTES.md`, writes SPEC + PLAN, builds the project end-to-end with critic-retry loops |

## Run a template you just installed

```bash
cd <dest>
pnpm generata <name>                   # run a workflow
pnpm generata help workflows           # list installed workflows + their args
pnpm generata help agents              # list installed agents
```

Or invoke the slash commands `init` generated under `.claude/commands/` - the names match your workflow filenames.

## Anatomy of a template

```
my-template/
├── generata.template.json     # required - the manifest
├── README.md                  # optional - copied in as README-<alias>.md
├── agents/                    # scanned recursively
│   ├── my-agent.ts            # default-exports defineAgent(...)
│   └── workflows/             # convention - any path under agents/ works
│       └── my-workflow.ts     # default-exports defineWorkflow(...)
├── files/                     # optional - contents copied to project root verbatim
└── skills/                    # optional - copied to .claude/skills/
```

Two files do all the work:

```ts
// agents/hello.ts
import { defineWorkflow } from "@generata/core";
import greeter from "./greeter.js";

export default defineWorkflow({
  description: "Greets the supplied message.",
  required: ["message"], // Supplied via --message flag
})
  .step("greet", ({ message }) => greeter({ message }))
  .build();
```

```ts
// agents/greeter.ts
import { defineAgent } from "@generata/core";

export default defineAgent<{ message: string }>(({ message }) => ({
  type: "worker",
  description: "Greets a message in one creative line.",
  modelTier: "light",
  prompt: `Greet "${message}" in one line.`,
}));
```

The filename becomes the agent or workflow name. Every `.ts` under `agents/` is scanned recursively and classified by its default export - `defineAgent` makes it an agent, `defineWorkflow` makes it a workflow. Putting workflows under `agents/workflows/` is a convention (used by `standup` and `coding`) but not a requirement; the `starter` template keeps its workflow flat in `agents/`.

## The manifest

`generata.template.json` is the only required file. Minimal example:

```json
{
  "name": "@you/my-template",
  "description": "What this template does, one line.",
  "engineVersion": "^1.0.0",
  "requiredBins": [
    {
      "name": "claude",
      "hint": "Install: https://docs.anthropic.com/claude-code"
    }
  ],
  "postInstall": "Run: pnpm generata hello --message world"
}
```

Full schema (all fields after `name`/`description` are optional):

| Field           | What it does                                                                               |
| :-------------- | :----------------------------------------------------------------------------------------- |
| `name`          | `@scope/alias` - shown during install and used to derive the `README-<alias>.md` filename  |
| `description`   | One-line summary, shown during install                                                     |
| `engineVersion` | Semver range pinned in the generated `package.json` (`@generata/core` dep)                 |
| `requiredBins`  | CLI tools that must be on PATH. `optional: true` to warn instead of fail                   |
| `requiredEnv`   | Env vars to prompt for at install. `{ description, example?, secret?, optional? }` per key |
| `installPaths`  | Override the default copy map. Keys are template paths, values are project-relative dests  |
| `postInstall`   | Multi-line string printed after install completes                                          |

The install spec users actually pass to `generata init` is the catalog key from [`templates.json`](../core/templates.json), a git URL, a `you/repo` short form, or a local path - not the manifest's `name`.

If `requiredEnv` is empty and no agent declares `envKeys`, no `.env.example` is written.

## What `init` actually does

1. Resolves the template (catalog / GitHub / git URL / local path).
2. Loads the manifest, validates it against the zod schema.
3. Runs preflight - checks every `requiredBins` entry is on PATH.
4. Copies files using `installPaths` (defaults: `agents/` -> `agents/`, `skills/` -> `.claude/skills/`, `files/` -> project root, `README.md` -> `README-<alias>.md`).
5. Writes `generata.config.ts` and `package.json` if absent.
6. Runs `pnpm install` (or matches your invoking package manager).
7. Loads every `.ts` under `agents/` to discover declared `envKeys`, generates `.env.example`, and prompts for any missing values.
8. Generates `.claude/commands/<workflow>.md` for every workflow it discovered.
9. Prints the manifest's `postInstall` string.

`generata add <template>` does steps 1, 2, 4, 8, and 9 - it merges a template into an existing project without touching config, running an install, or prompting for env. After copying it reloads the full project registry and regenerates the entire `.claude/commands/` set.

## Make your own

Easiest path: copy [`starter/`](./starter), rename it, edit the manifest, and add your agents.

```bash
mkdir my-template && cd my-template
# Copy from the starter as a base
cp -r /path/to/generata/packages/templates/starter/. .
# Edit generata.template.json: change name + description
# Add or edit agents under agents/
```

Test it locally before publishing:

```bash
generata init /absolute/path/to/my-template /tmp/test-install
```

Local paths skip the git clone and are the fastest dev loop. Relative paths starting with `./` or `../` work too.

## Host your own

Once your template directory has a `generata.template.json` at its root, anyone can install it. Three ways to publish:

**1. Push to GitHub.** Anyone can install with the short form:

```bash
generata init you/repo-name <dest>
```

This clones `https://github.com/you/repo-name.git` (depth 1) and installs from the root.

**2. Use a full git URL** for private mirrors, GitLab, SSH, or branch-pinning:

```bash
generata init https://gitlab.com/you/template.git <dest>
generata init git@github.com:you/template.git <dest>
generata init https://github.com/you/template.git@v2 <dest>     # branch or tag
```

**3. Monorepo subdir.** If your template lives at `packages/templates/foo/` inside a larger repo, contributors can still use the short form by pointing at the subdir from a fork of [`templates.json`](../core/templates.json), or you can submit a PR to add an alias to the catalog. Catalog entries support:

```json
{
  "@you/foo": {
    "url": "https://github.com/you/repo.git",
    "subdir": "packages/templates/foo",
    "ref": "v1.2.0"
  }
}
```

To get an alias listed in the official catalog, open a PR against `packages/core/templates.json`.

## Limitations

- **Templates are copied, not bundled.** `.ts` files are loaded at runtime via `tsx`. They are not type-checked or built as part of `@generata/core`'s release - errors only surface when `init` scans them after copy.
- **No template versioning beyond git.** Use `ref` in the catalog object form, or pin a tag in the URL (`url@v1.0.0`).
- **Any `@scope/name` spec is routed to the catalog first.** If the alias isn't in [`templates.json`](../core/templates.json), `init` errors out instead of falling through to git or local resolution. To install something not in the catalog, use a git URL, the `you/repo` short form, or a local path.
- **No template-to-template inheritance.** Want pieces of two templates? Run `generata add <template>` after `init` to layer one on top of another (file conflicts require `--force`).
- **Engine API is the contract, not the templates.** `defineAgent`, `defineWorkflow`, and `defineConfig` are stable. The agents and workflows in built-in templates can change without a major bump - copy them once and own them.

## See also

- [`packages/core`](../core) - the engine + CLI
- [Top-level README](../../README.md) - the framework overview
- [AGENTS.md](../../AGENTS.md) - development guide for contributing here
