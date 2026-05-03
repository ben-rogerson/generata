import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string; instructions: string }>(
  ({ spec_filepath, instructions }) => {
    const plan_filepath = spec_filepath.replace(/\/SPEC\.md$/, "/PLAN.md");
    return {
      type: "planner",
      description: "Reads SPEC.md (path passed in), writes PLAN.md alongside it",
      modelTier: "standard",
      permissions: "full",
      tools: ["write"],
      timeoutSeconds: 300,
      outputs: {
        plan_filepath: "Absolute path to the PLAN.md you wrote (use the path shown in the prompt)",
      },
      prompt: `
Read the spec at: ${spec_filepath}
Write the plan to: ${plan_filepath}

Your task: ${instructions}

Plan structure:
- **Objective** (one sentence echoing the spec)
- **Acceptance criteria** (bullet list of testable outcomes from SPEC)
- **Implementation steps** (numbered, concrete, actionable - no vague "set up" or "handle X" steps)
- **Dependencies and risks**
- **Estimated complexity** (low / medium / high)`,
    };
  },
);
