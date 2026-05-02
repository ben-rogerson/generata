---
name: idea
description: Capture a new feature idea as a structured note in internal/ideas/. Use when the user invokes /idea or says they want to "jot down an idea", "capture a feature idea", or similar. Asks a few questions, then writes a gitignored markdown file. Not a full design spec.
---

# Idea

Firm up a rough feature idea into a short structured note and save it to `internal/ideas/`. Lightweight - not a full design spec. The notes are gitignored and stay local.

## When to use

- User invokes `/idea` (with or without an inline pitch)
- User says "I have an idea", "let's capture an idea", "jot this down for later"

## When NOT to use

- User wants a full design / spec - use `superpowers:brainstorming` instead
- User wants to start implementing now - go straight to brainstorming or coding

## Invocation

- `/idea` alone - ask "What's the idea? Give me a one-line pitch." first
- `/idea <one-liner pitch>` - use the inline text as the seed and skip the opener

## Question flow

Ask **one question per turn**. Soft cap of **5 total questions**. Stop early when the idea feels firm enough (problem is clear AND at least one shaping decision has been answered). The user can say "done" or "save it" at any point and you write the file with whatever you have.

You MUST cover both of these at least once:

1. **Problem** - open-ended. e.g. "Who hurts without this? What does it block or slow down?"
2. **Open questions** - open-ended. e.g. "What are you unsure about? Anything you'd want to validate first?"

Also ask **1-3 contextual multiple-choice planning questions**, chosen by you based on what the user has said. These are rough shaping questions, not metadata. Don't ask formulaic things like "what size is this?" or "what's the priority?" - ask questions that meaningfully shape the idea.

Examples of good shaping questions (do NOT use this exact list - generate your own from context):

- "Sounds like this could live in `core` or as a separate package - which?"
- "Always-on or behind a flag?"
- "Should it warn-and-continue or hard-fail when X?"
- "Apply to existing rows on first run, or only new ones?"

Format multiple-choice questions as A/B/C with optional D = "something else".

## Stopping rule

After each answer, judge: is the problem clear? Has at least one shaping decision been made? If yes, you may stop and write the file. Otherwise ask another question. Hard cap at 5 questions total - never ask a 6th.

## Writing the file

### 1. Generate the slug

From the title (the one-line pitch), make a kebab-case slug of ~3-5 words. Strip filler words (the, a, of, for). Lowercase. ASCII only.

Examples:
- "Auto-prune stale workflows" → `auto-prune-stale-workflows`
- "Capture a feature idea quickly" → `capture-feature-idea`

### 2. Determine the path

`internal/ideas/YYYY-MM-DD-<slug>.md` where `YYYY-MM-DD` is today's date.

Get today's date from the environment context (it's surfaced as `currentDate`) - do NOT shell out to `date`.

### 3. Handle slug collision

If the target path already exists, ask the user:

> "`internal/ideas/<filename>` already exists. (a) save as `-2`, (b) overwrite, (c) cancel?"

- (a) → try `<slug>-2.md`, then `-3`, etc., until a free name is found
- (b) → overwrite
- (c) → abort, no file written, no further messages beyond confirming cancel

### 4. Ensure the directory exists

If `internal/ideas/` does not exist yet, create it with `mkdir -p internal/ideas`.

### 5. Write the file

Use this template. Omit any section that has no content (e.g. omit `## Notes` if no contextual MC questions were asked).

```md
# <one-line title>

## Problem
<the user's answer to the problem question, lightly cleaned up>

## Open questions
- <unknown 1>
- <unknown 2>

## Notes
<freeform notes from contextual MC answers, one short paragraph or bullet list>
```

Write the user's answers verbatim where possible. Don't editorialise. Don't add a "next steps" section. Don't add a status field.

### 6. Do NOT commit

`internal/ideas/` is gitignored. Never run `git add` or `git commit` for these files.

## Final message

End with exactly:

> Saved: `internal/ideas/YYYY-MM-DD-<slug>.md` - "<title>"

No summary of the contents. The user just answered the questions; they don't need them read back.

## Common mistakes

- **Asking metadata questions.** Don't ask for size, priority, or type. Ask shaping questions that affect the idea itself.
- **Asking too many questions.** 5 is the hard cap. 3-4 is usually enough.
- **Combining multiple questions in one turn.** One question per turn, always.
- **Reading the contents back at the end.** Just give the path and the title.
- **Committing the file.** Never. It's gitignored on purpose.
- **Using `date` to get today's date.** Use `currentDate` from the environment context.
- **Bundling the problem and open-questions questions.** They're separate turns.
