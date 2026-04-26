import { defineWorkflow } from "@generata/core";
import planRef from "../core/plan-ref.js";
import planExecutor from "../core/plan-executor.js";
import codeReviewer from "../core/code-reviewer.js";
import readmeWriter from "../utilities/readme-writer.js";
import notesTidier from "../utilities/notes-tidier.js";

export default defineWorkflow({
  description: "Execute a plan with post-validation and tidy up notes",
  required: ["plan_name"] as const,
  variables: { plans_dir: "plans", output_dir: "projects" },
  derive: ({ plans_dir, plan_name }) => ({
    plan_filepath: `${plans_dir}/${plan_name}.md`,
  }),
  steps: [
    { id: "ref", agent: planRef },
    { id: "execute", agent: planExecutor },
    { id: "verify", agent: codeReviewer },
    { id: "readme", agent: readmeWriter },
    { id: "tidy", agent: notesTidier, dependsOn: ["verify"] }, // TODO: What if this is above the verify step? Should be caught by the validator.
  ],
});
