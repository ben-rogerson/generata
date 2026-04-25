import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "standup-writer",
  type: "worker",
  description: "Turns a git activity summary into a 3-section standup (yesterday / today / blockers)",
  modelTier: "standard",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 60,
  promptTemplate: ({ git_summary, today_focus }) => `
You are drafting a daily standup for an engineer.

Yesterday's git activity:
${git_summary}

Today's stated focus (may be empty):
${today_focus || "(none provided)"}

Produce a standup in this exact shape - no extra prose:

**Yesterday**
- <bullet>
- <bullet>

**Today**
- <bullet, derived from today_focus if provided, else inferred from yesterday's trajectory>

**Blockers**
- <bullet, or "None">

Rules:
- Each section ≤ 3 bullets
- Use the simple past for yesterday, present/future for today
- Don't invent commits that weren't in the summary
- If yesterday is empty, write "- (no commits)"
`,
});
