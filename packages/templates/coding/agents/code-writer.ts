import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Implements PLAN.md inside the project directory",
  modelTier: "heavy",
  permissions: "full",
  tools: ["read", "write", "bash", "glob", "grep", "edit"],
  timeoutSeconds: 600,
  maxRetries: 1,
  promptContext: [{ filepath: ({ plan_filepath }) => plan_filepath }],
  promptTemplate: ({ project_dir }) => `
Implement the plan steps in order. PLAN.md is in your context.

IMPORTANT - directory conventions:
- Write all project source code inside: ${project_dir}/
- SPEC.md and PLAN.md already exist in ${project_dir}/. Do not modify them.
- Code files (package.json, src/, tests/, configs) live as siblings of SPEC.md and PLAN.md.
- Do NOT create a code/ subdirectory.

Run installs, scaffolding commands, and tests as needed via bash. The project directory is your sandbox.

When complete, lead your summary with: "STATUS: complete" (or "partial" / "failed"), then a one-line description, then the full summary.`,
});
