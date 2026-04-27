import { defineWorkflow } from "@generata/core";
import itemPicker from "../item-picker.js";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import planReviewer from "../plan-reviewer.js";
import codeWriter from "../code-writer.js";
import codeReviewer from "../code-reviewer.js";
import changeSummariser from "../change-summariser.js";

export default defineWorkflow({
  description: "Pick a backlog item, plan it, ship it through the full spec/plan/code/review pipeline.",
  steps: [
    { id: "pick",      agent: itemPicker },
    { id: "spec",      agent: specCreator,    dependsOn: ["pick"],
      args: ({ pick }) => ({ picker_output: pick }) },
    { id: "plan",      agent: planCreator,    dependsOn: ["spec"],
      args: ({ spec }) => ({ spec_creator_output: spec }) },
    { id: "review-plan", agent: planReviewer, dependsOn: ["plan"], maxRetries: 2,
      args: ({ spec, plan }) => ({
        spec_creator_output: spec,
        plan_creator_output: plan,
      }) },
    { id: "code",      agent: codeWriter,     dependsOn: ["review-plan"],
      args: ({ spec, plan }) => ({
        spec_creator_output: spec,
        plan_creator_output: plan,
      }) },
    { id: "review-code", agent: codeReviewer, dependsOn: ["code"], maxRetries: 2,
      args: ({ code, spec, plan }) => ({
        code_writer_output: code,
        spec_creator_output: spec,
        plan_creator_output: plan,
      }) },
    { id: "summarise", agent: changeSummariser, dependsOn: ["review-code"],
      args: ({ pick, code }) => ({
        picker_output: pick,
        code_writer_output: code,
      }) },
  ],
});
