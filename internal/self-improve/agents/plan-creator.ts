import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string }>(({ spec_filepath, today, work_dir }) => {
  // Slug is derivable from the spec filename: strip leading YYYY-MM-DD- and
  // trailing -design.md. The plan path follows the parallel docs/superpowers/
  // plans/ convention with the same date and slug.
  const slug = spec_filepath.match(/\/\d{4}-\d{2}-\d{2}-(.+)-design\.md$/)?.[1] ?? "";
  const plan_filepath = `${work_dir}/../../docs/superpowers/plans/${today}-${slug}.md`;
  return {
    type: "worker",
    description:
      "Reads the spec from spec-creator and writes an implementation plan, sized to the spec's SIZE declaration.",
    modelTier: "standard",
    permissions: "full",
    tools: ["write"],
    timeoutSeconds: 300,
    promptTemplate: `
Read the spec at: ${spec_filepath}
Write the plan to: ${plan_filepath}

Sizing rule (matches the spec's first-line SIZE: declaration; trust it verbatim):
- TRIVIAL: plan is a 1-3 step bulleted list. No headings.
- SMALL: plan is a 3-7 step list, optionally with a one-line acceptance criterion.
- SUBSTANTIAL: full numbered plan with Objective, Acceptance criteria, Implementation steps (each step concrete and actionable - no vague "set up X" or "handle Y" steps), Risks.

Procedure:
1. Read the spec file at ${spec_filepath}. The first line must match the regex \`^SIZE: (trivial|small|substantial)$\` exactly - no markdown formatting, no surrounding whitespace. If it does not, halt the workflow with reason "spec missing SIZE declaration: ${spec_filepath}".
2. Note the SIZE.
3. Write the plan to ${plan_filepath}. (That directory is gitignored - the plan is local scaffolding, not committed.)
4. Lead your final text response with a one-line objective summary.

Constraints: the only file you may create is the plan at the path above. Do not write outside docs/superpowers/plans/. Do not run bash. Do not edit existing source files.`,
    outputs: {
      plan_filepath: "Absolute path to the plan file you wrote (use the path shown in the prompt)",
    },
  };
});
