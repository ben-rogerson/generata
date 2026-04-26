import { defineWorkflow } from "@generata/core";
import planDreamer from "../core/plan-dreamer.js";
import planCreator from "../core/plan-creator.js";
import planAuditor from "../core/plan-auditor.js";
import planRemover from "../utilities/plan-remover.js";
import notesTidier from "../utilities/notes-tidier.js";

export default defineWorkflow({
  description: "Synthesise today's focus and generate the daily plan",
  variables: { plans_dir: "plans", output_dir: "projects" },
  derive: ({ plans_dir, plan_name }) => ({
    plan_filepath: `${plans_dir}/${plan_name}.md`,
  }),
  steps: [
    { id: "dream", agent: planDreamer },
    { id: "plan", agent: planCreator },
    { id: "review", agent: planAuditor, maxRetries: 0, onReject: planRemover },
    { id: "tidy", agent: notesTidier },
  ],
});
