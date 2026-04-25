import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "plan-dreamer",
  type: "planner",
  permissions: "read-only",
  description:
    "Reads goals, notes, and recent daily plans to synthesise today's focus, emits workflow params",
  modelTier: "standard",
  tools: ["read", "glob", "grep"],
  promptContext: [{ filepath: "goals.md" }, { filepath: "notes.md" }],
  timeoutSeconds: 120,
  promptTemplate: ({ today, plans_dir }) => `
You are deciding what today's daily plan should focus on.

- Glob ${plans_dir}/daily-*.md to find recent daily plans
- Read the most recent 2-3 to understand what's been planned and what's likely still pending

Then synthesise the most important work for today that:
- Advances the goals in goals.md
- Completes or continues in-progress items from recent plans
- Is realistic for a single day's focused work

Reason briefly about your synthesis, then call the params script as your final action.
The plan_name must be "daily-${today}".
The instructions should be 3-5 sentences: today's key focus areas, anything to carry forward from recent plans, and any important context or constraints.`,
});
