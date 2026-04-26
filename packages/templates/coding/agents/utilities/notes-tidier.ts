import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Tidies notes.md after a plan is written - removes or marks ideas that are now captured in the plan",
  modelTier: "light",
  tools: ["read", "edit", "glob"],
  permissions: "full",
  timeoutSeconds: 120,
  promptContext: [{ filepath: "notes.md" }],
  promptTemplate: ({ plan_filepath, plans_dir }) => `
Read the plan at ${plan_filepath || `${plans_dir}/daily-*.md (glob to find the most recent one)`}.

Compare the plan's objectives and steps against the ideas/items in notes.md.

For each note that is now captured in the plan:
- If it's a standalone idea or task, remove it from notes.md
- If it's part of a larger note, trim just the captured portion

Leave notes that are NOT addressed by the plan untouched.

Use the edit tool to make targeted changes to notes.md. Do not rewrite the whole file.

If nothing needs changing, do nothing.`,
});
