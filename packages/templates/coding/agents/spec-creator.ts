import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "planner",
  description:
    "Reads NOTES.md, picks the most compelling idea, writes SPEC.md, emits plan_name + instructions",
  modelTier: "standard",
  permissions: "full",
  tools: ["read", "write", "glob", "grep"],
  promptContext: [{ filepath: "NOTES.md" }],
  timeoutSeconds: 180,
  promptTemplate: ({ output_dir }) => `
You are deciding what to build next.

Read NOTES.md. Pick the single most compelling idea that:
- Has a concrete, testable outcome
- Is scoped to complete in one focused build cycle (not a platform, not a rewrite)
- Has not already been built (scan ${output_dir}/ for existing project dirs)

Reason briefly about your choice in prose. Then:

1. Decide on a kebab-case slug for the project (e.g. "rate-limiter-api"). This becomes plan_name.
2. Write the spec to ${output_dir}/<plan_name>/SPEC.md with these sections:
   - **Problem** (one paragraph: what the user need is)
   - **Goals** (bullet list of what the project must do)
   - **Non-goals** (bullet list of what is explicitly out of scope)
   - **Acceptance criteria** (bullet list of testable outcomes)
   - **Constraints** (tech stack, deployment target, anything fixed)
3. Call the params script as your final action with:
   - plan_name: the kebab-case slug
   - instructions: 2-4 sentences summarising what to build and the key acceptance criteria

The engine creates the project directory ${output_dir}/<plan_name>/ from your emitted plan_name, so writing SPEC.md to that path is safe to do before the params call.`,
});
