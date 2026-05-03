import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string }>(({ spec_filepath }) => {
  const project_dir = spec_filepath.replace(/\/SPEC\.md$/, "");
  return {
    type: "worker",
    description: "Writes README.md for the completed project",
    modelTier: "light",
    permissions: "full",
    tools: ["write", "bash"],
    timeoutSeconds: 180,
    promptTemplate: `
Project directory: ${project_dir}
SPEC: ${spec_filepath}

Read SPEC.md. Write README.md to ${project_dir}/README.md.

First, explore the project:
- Read package.json (if it exists) for name, scripts, dependencies
- Read the main source files to confirm what was actually built
- Note the entry points

Write the README with:
- Project name and one-line description (from SPEC's Problem section)
- What it does (2-3 sentences)
- Prerequisites
- Installation and setup
- Usage with examples
- Configuration (env vars, config files)

After writing, output a one-sentence summary of the project.`,
  };
});
