import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "planner",
  permissions: "read-only",
  description:
    "Reads a named project's plan and emits it as workflow params for downstream agents",
  modelTier: "light",
  tools: ["read", "glob"],
  timeoutSeconds: 60,
  promptTemplate: ({ project, project_dir }) => `
project: ${project}

Find and read the plan file inside ${project_dir}/plans/ if any exist.

Call the params script as your final action:
- plan_name: "${project}"
- instructions: A 1-2 sentence description of what was built and is being deployed. If no plan found, "Deploy ${project} to Cloudflare."`,
});
