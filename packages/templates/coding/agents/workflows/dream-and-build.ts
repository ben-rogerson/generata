import { defineWorkflow } from "@generata/core";
import projectDreamer from "../core/project-dreamer.js";
import planCreator from "../core/plan-creator.js";
import planAuditor from "../core/plan-auditor.js";
import planExecutor from "../core/plan-executor.js";
import planRemover from "../utilities/plan-remover.js";
import codeReviewer from "../core/code-reviewer.js";
import gitCommitter from "../core/git-committer.js";
import readmeWriter from "../utilities/readme-writer.js";
import notesTidier from "../utilities/notes-tidier.js";

export default defineWorkflow({
  description: "Autonomously pick the next project and build it end to end",
  variables: { plans_dir: "plans", output_dir: "projects" },
  derive: ({ plans_dir, plan_name }) => ({
    plan_filepath: `${plans_dir}/${plan_name}.md`,
  }),
  steps: [
    { id: "dream", agent: projectDreamer },
    { id: "plan", agent: planCreator },
    { id: "audit", agent: planAuditor },
    { id: "execute", agent: planExecutor },
    { id: "verify", agent: codeReviewer, onReject: planRemover },
    { id: "readme", agent: readmeWriter },
    { id: "commit", agent: gitCommitter },
    { id: "tidy", agent: notesTidier, dependsOn: ["verify"] }, // TODO: What if this is above the verify step? Should be caught by the validator.
  ],
});
