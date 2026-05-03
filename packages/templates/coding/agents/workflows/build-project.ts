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
    random_pick: String(Math.floor(Math.random() * 1_000_000)),
  }),
})
  .step("dream", specCreator)
  .step("plan", planCreator)
  .step("audit", planReviewer, { maxRetries: 2 })
  .step("execute", codeWriter)
  .step("verify", codeReviewer, { onReject: rejectedCodeTidier })
  .step("readme", readmeWriter)
  .step("tidy", endTidier, { dependsOn: ["verify"] })
  .build();
