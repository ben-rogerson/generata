import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_creator_output: string }>(
  ({ spec_creator_output, today, work_dir }) => ({
    type: "worker",
    description:
      "Reads the spec from spec-creator and writes an implementation plan, sized to the spec's SIZE declaration.",
    modelTier: "standard",
    permissions: "full",
    tools: ["write"],
    timeoutSeconds: 300,
    promptTemplate: `
You receive the spec-creator's final response in:

SPEC CREATOR OUTPUT:
${spec_creator_output}

If SPEC CREATOR OUTPUT contains the literal string \`NO_ITEMS\` or \`PICKER PARSE ERROR\`, propagate that line verbatim and stop. Do not write a plan. Do not call any tool.

Otherwise:

Extract the spec path from the \`SPEC WRITTEN: <path>\` line. Read the spec.

Sizing rule (matches the spec's first-line SIZE: declaration; trust it verbatim):
- TRIVIAL: plan is a 1-3 step bulleted list. No headings.
- SMALL: plan is a 3-7 step list, optionally with a one-line acceptance criterion.
- SUBSTANTIAL: full numbered plan with Objective, Acceptance criteria, Implementation steps (each step concrete and actionable - no vague "set up X" or "handle Y" steps), Risks.

Procedure:
1. Read the spec file referenced in SPEC CREATOR OUTPUT. The first line must match the regex \`^SIZE: (trivial|small|substantial)$\` exactly - no markdown formatting, no surrounding whitespace. If it does not, print exactly \`SPEC SIZE MISSING: <path>\` and stop.
2. Note the SIZE.
3. Derive the slug from the spec filename: strip the leading \`YYYY-MM-DD-\` (the first 11 characters) and the literal trailing suffix \`-design.md\`. What remains is the slug. The slug itself may contain \`-design\` internally; only the trailing suffix is stripped.
4. Write the plan to: \`${work_dir}/../../docs/superpowers/plans/${today}-<slug>.md\`. (The path traverses from \`internal/self-improve/\` up to the repo root, then into \`docs/superpowers/plans/\`. That directory is gitignored - the plan is local scaffolding, not committed.)
5. Lead your final response with: \`PLAN WRITTEN: <absolute path>\` then a one-line objective summary.

Constraints: the only file you may create is the plan at the path in step 4. Do not write outside docs/superpowers/plans/. Do not run bash. Do not edit existing source files.`,
  }),
);
