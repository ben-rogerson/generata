import { defineWorkflow, worktree } from "@generata/core";
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
  isolation: worktree({
    sharedPaths: ["IMPROVEMENTS.md", "last-run.md"],
  }),
})
  .step("pick", itemPicker)
  .step("spec", ({ pick }) => specCreator({ picker_output: pick }))
  .step("plan", ({ spec }) => planCreator({ spec_creator_output: spec }))
  .step(
    "review-plan",
    ({ spec, plan }) => planReviewer({ spec_creator_output: spec, plan_creator_output: plan }),
    { maxRetries: 2 },
  )
  .step("code", ({ spec, plan }) =>
    codeWriter({ spec_creator_output: spec, plan_creator_output: plan }),
  )
  .step(
    "review-code",
    ({ code, spec, plan }) =>
      codeReviewer({
        code_writer_output: code,
        spec_creator_output: spec,
        plan_creator_output: plan,
      }),
    { maxRetries: 2 },
  )
  .step("summarise", ({ pick, code }) =>
    changeSummariser({ picker_output: pick, code_writer_output: code }),
  )
  .step("ship", ({ summarise }) => shipper({ summariser_output: summarise }))
  .build();
