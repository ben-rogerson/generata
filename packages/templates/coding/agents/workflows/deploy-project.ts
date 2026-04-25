import { defineWorkflow } from "@generata/core";
import projectRef from "../core/project-ref.js";
import cloudflareDeployer from "../deployment/cloudflare-deployer.js";

export default defineWorkflow({
  name: "deploy-project",
  description: "Deploy a project to Cloudflare",
  required: ["project"] as const,
  variables: { plans_dir: "plans", output_dir: "projects" },
  derive: ({ output_dir, project }) => ({
    project_dir: `${output_dir}/${project}`,
  }),
  steps: [
    { id: "ref", agent: projectRef },
    // { id: "verify", agent: codeReviewer }, // TODO: replace with cloudflare deployer validator
    { id: "deploy", agent: cloudflareDeployer },
  ],
});
