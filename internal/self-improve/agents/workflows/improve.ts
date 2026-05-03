import { defineWorkflow, worktree } from "@generata/core";
import itemPicker from "../item-picker.js";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import planReviewer from "../plan-reviewer.js";
import codeWriter from "../code-writer.js";
import codeReviewer from "../code-reviewer.js";
import changeSummariser from "../change-summariser.js";
import shipper from "../shipper.js";

// Each step's agent emits typed outputs (slug, spec_filepath, plan_filepath,
// bump, commit_subject, commit_body) via the engine's `outputs` mechanism.
// Downstream stepFns destructure them with full type-safety; no parsing of
// upstream text in any agent or workflow.
export default defineWorkflow({
  description:
    "Pick a backlog item, plan it, ship it through the full spec/plan/code/review pipeline.",
  isolation: worktree({
    sharedPaths: ["IMPROVEMENTS.md", "last-run.md"],
  }),
})
  .step("pick", itemPicker)
  .step("spec", ({ slug, description, evidence_paths, suggested_change }) =>
    specCreator({ slug, description, evidence_paths, suggested_change }),
  )
  .step("plan", ({ spec_filepath }) => planCreator({ spec_filepath }))
  .step(
    "review-plan",
    ({ spec_filepath, plan_filepath }) => planReviewer({ spec_filepath, plan_filepath }),
    { maxRetries: 2 },
  )
  .step("code", ({ spec_filepath, plan_filepath }) => codeWriter({ spec_filepath, plan_filepath }))
  .step(
    "review-code",
    ({ code, spec_filepath, plan_filepath }) =>
      codeReviewer({ code_writer_output: code, spec_filepath, plan_filepath }),
    { maxRetries: 2 },
  )
  .step("summarise", ({ slug, code }) => changeSummariser({ slug, code_writer_output: code }))
  .step("ship", ({ slug, bump, commit_subject, commit_body }) =>
    shipper({ slug, bump, commit_subject, commit_body }),
  )
  .build();
