# @generata/coding

Plan-driven coding pipeline: interview the goal, write a plan, audit it, execute it, review the code, commit. Built on top of [@generata/core](https://github.com/generata/core).

## Install

```bash
npx @generata/core init @generata/coding ~/Projects/my-pipeline
# or: pnpm dlx @generata/core init @generata/coding ~/Projects/my-pipeline
cd ~/Projects/my-pipeline
```

## What's included

**Agents** (`agents/`):

| Agent                 | Type    | Purpose                                                  |
| :-------------------- | :------ | :------------------------------------------------------- |
| `plan-interviewer`    | planner | Shape a vague idea into a plan via Q&A                   |
| `plan-creator`        | planner | Generate a structured plan file                          |
| `plan-dreamer`        | planner | Brainstorm a plan from scratch                           |
| `plan-auditor`        | critic  | Triage a plan: approve / cancel / hold                   |
| `plan-ref`            | worker  | Pre-execution reference enrichment                       |
| `plan-executor`       | worker  | Execute the plan - coding, scaffolding                   |
| `code-reviewer`       | critic  | Post-execution review, typecheck, tests                  |
| `git-committer`       | worker  | Commit produced changes                                  |
| `project-dreamer`     | planner | Pick the next thing to build                             |
| `project-ref`         | worker  | Reference enrichment for project ideation                |
| `readme-writer`       | worker  | Generate a README.md for finished projects               |
| `notes-tidier`        | worker  | Tidy notes.md after a plan is written                    |
| `plan-remover`        | worker  | Remove a rejected plan                                   |
| `cloudflare-deployer` | worker  | Optional: deploy to Cloudflare Workers/Pages             |

**Workflows** (`agents/workflows/`):

| Workflow          | Description                                                  |
| :---------------- | :----------------------------------------------------------- |
| `execute-plan`    | Run a plan: pre-ref → execute → review → README → tidy       |
| `daily-plan`      | Dream → create → audit → tidy                                |
| `dream-and-build` | End-to-end autonomous: pick a project, build, review, commit |
| `deploy-project`  | Optional: build and deploy to Cloudflare                     |

## Required env

| Variable             | Description                                                |
| :------------------- | :--------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | _(optional)_ Telegram bot token for run notifications      |
| `TELEGRAM_CHAT_ID`   | _(optional)_ Telegram chat ID where notifications post     |

`generata init` will prompt for these and write them to `.env`. The working directory (where `projects/`, `plans/`, `metrics/` live) is configured in `generata.config.ts`, not via env.

## Required commands on PATH

| Command             | Why                                                                 |
| :------------------ | :------------------------------------------------------------------ |
| `claude`            | Required - the Claude Code CLI runs every agent invocation          |
| `git`               | Required for `git-committer`                                        |
| `terminal-notifier` | _(optional, macOS)_ Persistent notifications via `brew install ...` |
| `wrangler`          | _(optional)_ Only needed if you use `cloudflare-deployer`           |

## Quick start

```bash
# Try the daily-plan workflow (no required args)
pnpm generata workflow daily-plan
# or: npx generata workflow daily-plan

# Or kick off a fresh plan and execute it
pnpm generata workflow execute-plan --plan_name my-first
```

## Customising

Every file under `agents/` is yours to edit. Adjust prompts, add new agents, compose new workflows. Re-run `pnpm generata skills sync` after adding/renaming workflows to regenerate `.claude/commands/`.
