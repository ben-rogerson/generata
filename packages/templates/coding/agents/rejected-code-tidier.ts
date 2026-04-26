// packages/templates/coding/agents/rejected-code-tidier.ts
import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Archives a rejected project and removes the idea from NOTES.md",
  modelTier: "light",
  permissions: "full",
  tools: ["read", "edit", "bash"],
  timeoutSeconds: 120,
  promptContext: [{ filepath: "NOTES.md" }],
  promptTemplate: ({ project_dir, output_dir, plan_name, instructions }) => `
The project at ${project_dir} was rejected by the code reviewer. Archive it cleanly.

The original idea was:

${instructions}

Steps:

1. Ensure the archive parent dir exists:
   mkdir -p ${output_dir}/_archive

2. Move the project into the archive:
   mv ${project_dir} ${output_dir}/_archive/${plan_name}

3. Write ${output_dir}/_archive/${plan_name}/REASON.md with:
   - Header: "# Why this project was archived"
   - One paragraph noting the project failed code review
   - The original idea (the "instructions" text above)
   - A pointer to SPEC.md and PLAN.md inside the same archive dir for full context

4. Edit NOTES.md to remove the entry that matches the original idea above. If it's part of a larger note, trim only the captured portion. If no clear match, leave NOTES.md alone.

Confirm completion with a one-line summary listing what you moved and what you trimmed.`,
});
