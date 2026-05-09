// Programmatic audit driver.
// Three sequential passes:
//   1. repo-scanner appends new findings to IMPROVEMENTS.md as it discovers them.
//   2. audit-prioritiser scores each unscored entry by editing the header in place.
//   3. sortImprovements (deterministic TS) sorts the file by score desc.
// No JSON crosses agent boundaries; the file itself is the contract.

import { runAgent } from "@generata/core";
import config from "../generata.config.js";
import repoScanner from "../agents/repo-scanner.js";
import auditPrioritiser from "../agents/audit-prioritiser.js";
import { sortImprovements, formatSortSummary } from "./sort-improvements.js";

const ac = new AbortController();
process.once("SIGINT", () => {
  console.error("\n^C - aborting...");
  ac.abort();
});

async function main(): Promise<void> {
  console.log("→ scanning repo");
  await runAgent(repoScanner({}).agent, {}, { config, signal: ac.signal });

  console.log("→ scoring new entries");
  await runAgent(auditPrioritiser({}).agent, {}, { config, signal: ac.signal });

  console.log("→ sorting IMPROVEMENTS.md");
  const summary = sortImprovements();
  console.log(formatSortSummary(summary));
}

try {
  await main();
} catch (err) {
  if ((err as Error).name === "AbortError") {
    console.error("audit cancelled");
    process.exit(130);
  }
  console.error(`audit failed: ${(err as Error).message}`);
  process.exit(1);
}
