import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Execute a plan - scaffolding, coding, file creation",
  modelTier: "heavy",
  tools: ["read", "write", "bash", "glob", "grep", "edit"],
  permissions: "full",
  timeoutSeconds: 600,
  maxRetries: 1,
  promptContext: [
    { filepath: "memory/index.md", optional: true },
    { filepath: ({ today }) => `memory/${today}.md`, optional: true },
    { filepath: "memory/progress.txt", tail: 50, optional: true },
    { filepath: ({ plan_filepath }) => plan_filepath },
  ],
  promptTemplate: ({ plan_name, output_dir }) => `
  Implement the plan steps in order.

  IMPORTANT - directory conventions:
  - All project source code must go inside: ${output_dir}/${plan_name}/code/
  - Do NOT create files directly in ${output_dir}/${plan_name}/

  When complete, lead your summary with: "STATUS: complete" (or "partial" / "failed"), then a one-line description of what was done, then the full summary.`,
});
