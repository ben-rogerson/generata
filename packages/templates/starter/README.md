# @generata/starter

Bare-minimum starter template. One worker agent, one workflow. Designed to be edited or thrown away as you build your own pipeline.

## What you get

| File                | Purpose                                                |
| :------------------ | :----------------------------------------------------- |
| `agents/greeter.ts` | A worker that greets a message in a creative one-liner |
| `agents/hello.ts`   | A one-step workflow that runs `greeter`                |

## Quick start

```bash
pnpm generata workflow hello --message "world"
```

If you didn't `cd` into the project, prefix with `pnpm dlx` or `npx`.

## What's next

1. Open `agents/greeter.ts` and rename / repurpose it.
2. Add new agents in `agents/` (or subdirectories - they're scanned recursively).
3. Add workflows in `agents/` (or `agents/workflows/` subdirectory) and they'll show up in `pnpm generata help workflows`.
4. Run `pnpm generata skills sync` after adding workflows to refresh `.claude/commands/`.

There is no project opinion here - the agent and workflow are placeholders. See `@generata/coding` for a full-featured example.
