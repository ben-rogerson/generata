import { defineWorkflow } from "@generata/core";
import repoScanner from "../repo-scanner.js";
import auditPrioritiser from "../audit-prioritiser.js";
import backlogWriter from "../backlog-writer.js";

export default defineWorkflow({
  description: "Scan the generata repo for improvements and append findings to IMPROVEMENTS.md.",
})
  .step("scan", repoScanner)
  .step("prioritise", ({ scan }) => auditPrioritiser({ scanner_output: scan }))
  .step("write", ({ prioritise }) => backlogWriter({ prioritiser_output: prioritise }))
  .build();
