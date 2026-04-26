import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Generate a README.md for a completed project",
  modelTier: "light",
  tools: ["read", "write", "glob", "grep"],
  permissions: "full",
  timeoutSeconds: 180,
  promptTemplate: ({ plan_name, output_dir }) => `
  Generate a README.md for the project at ${output_dir}/${plan_name}/code/.

  First, explore the project:
  - Read package.json for name, description, scripts
  - Read the main source files to understand what the project does
  - Check for any existing docs or comments

  Write a README.md that includes:
  - Project name and one-line description
  - What it does (2-3 sentences)
  - Prerequisites
  - Installation and setup
  - Usage (with examples)
  - Configuration (env vars, config files)
  - Deployment (if applicable)

  Write to ${output_dir}/${plan_name}/code/README.md

  After writing the README.md, output a one sentence summary of the project.`,
});
