import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string; plan_filepath: string }>(
  ({ spec_filepath, plan_filepath }) => {
    const project_dir = spec_filepath.replace(/\/SPEC\.md$/, "");
    return {
      type: "worker",
      description: "Implements PLAN.md inside the project directory",
      modelTier: "heavy",
      permissions: "full",
      tools: ["write", "bash", "edit"],
      timeoutSeconds: 600,
      maxRetries: 1,
      promptTemplate: `
Project directory: ${project_dir}
SPEC: ${spec_filepath}
PLAN: ${plan_filepath}

Read both files, then implement the plan steps in order.

IMPORTANT - directory conventions:
- Write all project source code inside ${project_dir}.
- SPEC.md and PLAN.md already exist there. Do not modify them.
- Code files (package.json, src/, tests/, configs) live as siblings of SPEC.md and PLAN.md.
- Do NOT create a code/ subdirectory.

Run installs, scaffolding commands, and tests as needed via bash. The project directory is your sandbox.

When complete, lead your summary with: "STATUS: complete" (or "partial" / "failed"), then a one-line description, then the full summary.`,
    };
  },
);
