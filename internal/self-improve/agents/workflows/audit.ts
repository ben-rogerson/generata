import { defineWorkflow } from "@generata/core";
import repoScanner from "../repo-scanner.js";
import auditPrioritiser from "../audit-prioritiser.js";
import backlogWriter from "../backlog-writer.js";

export default defineWorkflow({
  description: "Scan the generata repo for improvements and append findings to IMPROVEMENTS.md.",
  steps: [
    { id: "scan",       agent: repoScanner },
    { id: "prioritise", agent: auditPrioritiser, dependsOn: ["scan"],
      args: ({ scan }) => ({ scanner_output: scan }) },
    { id: "write",      agent: backlogWriter, dependsOn: ["prioritise"],
      args: ({ prioritise }) => ({ prioritiser_output: prioritise }) },
  ],
});
