import { defineWorkflow } from "@generata/core";
import specCreator from "../spec-creator.js";
import planCreator from "../plan-creator.js";
import planReviewer from "../plan-reviewer.js";
import codeWriter from "../code-writer.js";
import codeReviewer from "../code-reviewer.js";
import readmeWriter from "../readme-writer.js";
import endTidier from "../end-tidier.js";
import rejectedCodeTidier from "../rejected-code-tidier.js";

// Each step's agent emits typed `outputs` (e.g. spec_filepath, instructions,
// plan_filepath) which the engine merges into the runtime params bag. Downstream
// stepFns destructure them with full type-safety; no parsing needed in this file
// or in the agents themselves.
export default defineWorkflow({
  description: "Pick an idea from NOTES.md, spec it, plan it, build it, review it",
  variables: { output_dir: "projects" },
  derive: () => ({
    random_pick: String(Math.floor(Math.random() * 1_000_000)),
  }),
})
  .step("dream", ({ output_dir, random_pick }) => specCreator({ output_dir, random_pick }))
  .step("plan", ({ spec_filepath, instructions }) =>
    planCreator({ spec_filepath, instructions }),
  )
  .step(
    "audit",
    ({ spec_filepath, plan_filepath }) => planReviewer({ spec_filepath, plan_filepath }),
    { maxRetries: 2 },
  )
  .step("execute", ({ spec_filepath, plan_filepath }) =>
    codeWriter({ spec_filepath, plan_filepath }),
  )
  .step(
    "verify",
    ({ spec_filepath, plan_filepath, execute }) =>
      codeReviewer({ spec_filepath, plan_filepath, code_writer_output: execute }),
    {
      onReject: ({ spec_filepath, instructions, output_dir }) =>
        rejectedCodeTidier({ spec_filepath, instructions, output_dir }),
    },
  )
  .step("readme", ({ spec_filepath }) => readmeWriter({ spec_filepath }))
  .step(
    "tidy",
    ({ instructions }) => endTidier({ instructions }),
    { dependsOn: ["verify"] },
  )
  .build();
