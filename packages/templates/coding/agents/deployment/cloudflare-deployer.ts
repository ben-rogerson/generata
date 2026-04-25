import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "cloudflare-deployer",
  type: "worker",
  description: "Deploy a project to Cloudflare Workers or Pages",
  modelTier: "standard",
  promptContext: [
    { filepath: ({ project_dir }) => `${project_dir}/code/wrangler.jsonc` },
  ],
  tools: ["read", "bash", "glob"],
  permissions: "full",
  timeoutSeconds: 300,
  promptTemplate: ({ project, project_dir }) => `
  Project: ${project}
  Project source: ${project_dir}/code/

  Deploy the project to Cloudflare. Steps:
  1. cd into ${project_dir}/code/
  2. Inspect wrangler.jsonc to decide Workers vs Pages
  3. Run \`wrangler deploy\` (or \`wrangler pages deploy\` for Pages projects)
  4. Verify the deployment succeeded
  5. Output the deployed URL

  If deployment fails, report the error clearly with the full output.`,
});
