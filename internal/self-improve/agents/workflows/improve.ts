import { defineWorkflow } from "@generata/core";
import itemPicker from "../item-picker.js";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import planReviewer from "../plan-reviewer.js";
import codeWriter from "../code-writer.js";
import codeReviewer from "../code-reviewer.js";
import changeSummariser from "../change-summariser.js";
import shipper from "../shipper.js";

export default defineWorkflow({
  description:
    "Pick a backlog item, plan it, ship it through the full spec/plan/code/review pipeline.",
  isolation: "worktree",
  sharedPaths: ["IMPROVEMENTS.md", "last-run.md"],
  steps: [
    { id: "pick", agent: itemPicker },
    {
      id: "spec",
      agent: specCreator,
      args: ({ pick }) => ({ picker_output: pick }),
    },
    {
      id: "plan",
      agent: planCreator,
      args: ({ spec }) => ({ spec_creator_output: spec }),
    },
    {
      id: "review-plan",
      agent: planReviewer,
      maxRetries: 2,
      args: ({ spec, plan }) => ({
        spec_creator_output: spec,
        plan_creator_output: plan,
      }),
    },
    {
      id: "code",
      agent: codeWriter,
      args: ({ spec, plan }) => ({
        spec_creator_output: spec,
        plan_creator_output: plan,
      }),
    },
    {
      id: "review-code",
      agent: codeReviewer,
      maxRetries: 2,
      args: ({ code, spec, plan }) => ({
        code_writer_output: code,
        spec_creator_output: spec,
        plan_creator_output: plan,
      }),
    },
    {
      id: "summarise",
      agent: changeSummariser,
      args: ({ pick, code }) => ({
        picker_output: pick,
        code_writer_output: code,
      }),
    },
    {
      id: "ship",
      agent: shipper,
      args: ({ summarise }) => ({ summariser_output: summarise }),
    },
  ],
});
