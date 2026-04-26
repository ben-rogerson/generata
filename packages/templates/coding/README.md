# @generata/coding

Spec-driven coding pipeline: pick an idea from `NOTES.md`, spec it, plan it, build it, review it. Built on top of [@generata/core](https://github.com/generata/core).

## Install

```bash
pnpm dlx @generata/core init @generata/coding ~/Projects/my-pipeline
# or: npx @generata/core init @generata/coding ~/Projects/my-pipeline
cd ~/Projects/my-pipeline
```

## What's included

**Workflow** (`agents/workflows/`):

| Workflow         | Description                                         |
| :--------------- | :-------------------------------------------------- |
| `build-project`  | dream -> plan -> audit -> execute -> verify -> readme -> tidy |

**Agents** (`agents/`):

| Agent                  | Type    | Purpose                                                       |
| :--------------------- | :------ | :------------------------------------------------------------ |
| `spec-creator`         | planner | Pick an idea from NOTES.md, write SPEC.md, emit plan_name     |
| `plan-creator`         | planner | Read SPEC.md, write PLAN.md                                   |
| `plan-reviewer`        | critic  | Audit PLAN.md against SPEC.md (rejects retry plan-creator)    |
| `code-writer`          | worker  | Implement PLAN.md inside the project dir                      |
| `code-reviewer`        | critic  | Typecheck + tests + acceptance criteria                       |
| `readme-writer`        | worker  | Write README.md for the finished project                      |
| `end-tidier`           | worker  | Remove the used idea from NOTES.md (success path)             |
| `rejected-code-tidier` | worker  | Archive failed projects with REASON.md (reject path)          |

## Filesystem layout

```
<workDir>/
├── NOTES.md                          # idea backlog (pre-populated; you edit it)
├── projects/
│   ├── <plan-name>/                  # successful build
│   │   ├── SPEC.md
│   │   ├── PLAN.md
│   │   ├── README.md
│   │   └── ... (code)
│   └── _archive/<plan-name>/         # rejected build
│       ├── SPEC.md
│       ├── PLAN.md
│       ├── REASON.md
│       └── ... (code at point of rejection)
```

## Required commands on PATH

| Command             | Why                                                                 |
| :------------------ | :------------------------------------------------------------------ |
| `claude`            | Required - the Claude Code CLI runs every agent invocation          |
| `terminal-notifier` | _(optional, macOS)_ Persistent notifications via `brew install ...` |

## Quick start

`NOTES.md` ships pre-populated with starter ideas, so you can run the workflow immediately:

```bash
pnpm generata workflow build-project
```

Edit `NOTES.md` to add your own ideas, replace the starters, or remove anything you don't want built.

## Customising

Every file under `agents/` is yours to edit. Adjust prompts, rename, add new agents, or compose new workflows. Re-run `pnpm generata skills sync` after adding/renaming workflows to regenerate `.claude/commands/`.
