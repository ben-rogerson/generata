import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "plan-creator",
  type: "planner",
  description: "Reads goals.md + notes.md, generates structured plan files",
  modelTier: "standard",
  tools: ["read", "write", "glob", "grep"],
  permissions: "full",
  timeoutSeconds: 300,
  promptTemplate: ({
    plan_name,
    instructions,
    plans_dir,
  }) => `Your task: ${instructions}

Write a structured markdown plan to ${plans_dir}/${plan_name}.md with:
- Objective (one sentence)
- Acceptance criteria (bullet list of testable outcomes)
- Implementation steps (numbered, concrete and actionable - no vague steps)
- Dependencies and risks
- Estimated complexity (low/medium/high)

Once written, lead your response with: "PLAN WRITTEN: ${plans_dir}/${plan_name}.md" then confirm the objective in one sentence.`,
});
