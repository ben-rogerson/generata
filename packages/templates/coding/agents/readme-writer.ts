// packages/templates/coding/agents/readme-writer.ts
import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Writes README.md for the completed project",
  modelTier: "light",
  permissions: "full",
  tools: ["read", "write", "glob", "grep"],
  timeoutSeconds: 180,
  promptContext: [{ filepath: ({ spec_filepath }) => spec_filepath }],
  promptTemplate: ({ project_dir }) => `
Write a README.md for the project at ${project_dir}/.

SPEC.md is in your context - use it for purpose and acceptance criteria.

First, explore the project:
- Read package.json (if it exists) for name, scripts, dependencies
- Read the main source files to confirm what was actually built
- Note the entry points

Write ${project_dir}/README.md with:
- Project name and one-line description (from SPEC's Problem section)
- What it does (2-3 sentences)
- Prerequisites
- Installation and setup
- Usage with examples
- Configuration (env vars, config files)

After writing, output a one-sentence summary of the project.`,
});
