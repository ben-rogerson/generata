import { defineWorkflow } from "@generata/core";
import repoScanner from "../repo-scanner.js";
import auditPrioritiser from "../audit-prioritiser.js";
import backlogWriter from "../backlog-writer.js";

export default defineWorkflow({
  description: "Scan the generata repo for improvements and append findings to IMPROVEMENTS.md.",
})
  .step("scan", repoScanner)
  .step("prioritise", ({ findings_json }) => auditPrioritiser({ findings_json }))
  .step("write", ({ ranked_json }) => backlogWriter({ ranked_json }))
  .build();
