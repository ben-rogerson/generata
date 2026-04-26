import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "planner",
  description: "Reads SPEC.md, writes PLAN.md for the project",
  modelTier: "standard",
  permissions: "full",
  tools: ["read", "write", "glob", "grep"],
  promptContext: [{ filepath: ({ spec_filepath }) => spec_filepath }],
  timeoutSeconds: 300,
  promptTemplate: ({ plan_filepath, instructions }) => `
Your task: ${instructions}

Read the SPEC at the file shown in your context and write a structured implementation plan to ${plan_filepath} with:
- **Objective** (one sentence echoing the spec)
- **Acceptance criteria** (bullet list of testable outcomes from SPEC)
- **Implementation steps** (numbered, concrete, actionable - no vague "set up" or "handle X" steps)
- **Dependencies and risks**
- **Estimated complexity** (low / medium / high)

Once written, lead your response with: "PLAN WRITTEN: ${plan_filepath}" then confirm the objective in one sentence.`,
});
