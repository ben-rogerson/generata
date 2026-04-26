// packages/templates/coding/agents/workflows/build-project.ts
import { defineWorkflow } from "@generata/core";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import planReviewer from "../plan-reviewer.js";
import codeWriter from "../code-writer.js";
import codeReviewer from "../code-reviewer.js";
import readmeWriter from "../readme-writer.js";
import endTidier from "../end-tidier.js";
import rejectedCodeTidier from "../rejected-code-tidier.js";

export default defineWorkflow({
  description: "Pick an idea from NOTES.md, spec it, plan it, build it, review it",
  variables: { output_dir: "projects" },
  derive: ({ output_dir, plan_name }) => ({
    project_dir: `${output_dir}/${plan_name}`,
    spec_filepath: `${output_dir}/${plan_name}/SPEC.md`,
    plan_filepath: `${output_dir}/${plan_name}/PLAN.md`,
  }),
  steps: [
    { id: "dream",   agent: specCreator },
    { id: "plan",    agent: planCreator },
    { id: "audit",   agent: planReviewer, maxRetries: 2 },
    { id: "execute", agent: codeWriter },
    { id: "verify",  agent: codeReviewer, onReject: rejectedCodeTidier },
    { id: "readme",  agent: readmeWriter },
    { id: "tidy",    agent: endTidier, dependsOn: ["verify"] },
  ],
});
