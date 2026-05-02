# @generata/standup

Daily standup generator. Two agents, one workflow.

## What it does

Reads yesterday's git activity, then drafts a standup in three sections:

```
**Yesterday**
- <what shipped>

**Today**
- <stated focus, or inferred from yesterday>

**Blockers**
- <or "None">
```

## Quick start

```bash
# Use the cwd as the repo
pnpm generata standup

# Or point at a different repo
pnpm generata standup --repo /path/to/other-repo

# Or seed today's focus
pnpm generata standup --today_focus "Land the auth migration"
```

## What you get

| File                                  | Purpose                                              |
| :------------------------------------ | :--------------------------------------------------- |
| `agents/git-summariser.ts`            | Worker. Reads `git log` and emits a bullet summary   |
| `agents/standup-writer.ts`            | Worker. Turns the summary into the 3-section format  |
| `agents/workflows/standup.ts`         | Two-step workflow: summarise → write                 |

## Customising

- Tweak the prompt in `standup-writer.ts` to change tone, length, or section order.
- Replace `git-summariser.ts` with a different source - e.g. read a JIRA dump, parse PR descriptions, etc. The standup-writer doesn't care where its input comes from, only that it gets a `git_summary`.
