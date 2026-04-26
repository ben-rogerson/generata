import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "planner",
  permissions: "read-only",
  description:
    "Reads a named plan and emits it as workflow params for downstream agents",
  modelTier: "light",
  tools: ["read", "glob"],
  timeoutSeconds: 60,
  promptTemplate: ({ plan_name, plans_dir }) => `
plan_name: ${plan_name}

Check if ${plans_dir}/${plan_name}.md exists and read it if so.

Call the params script as your final action:
- plan_name: "${plan_name}"
- instructions: If the plan exists, a 1-2 sentence summary of its objective. If not, "Create and implement a complete solution for ${plan_name}."`,
});
