// Programmatic audit driver. Replaces the CLI workflow + the
// `backlog-writer` agent (which was a fake LLM step that wrote a temp file
// and shelled out to `merge-improvements.ts`). Now: two real LLM calls
// chained via `runAgent`, then a direct call into the merge function. The
// LLM does what only an LLM can do (scan + score); deterministic glue stays
// in TypeScript where it's auditable.

import { runAgent } from "@generata/core";
import config from "../generata.config.js";
import repoScanner from "../agents/repo-scanner.js";
import auditPrioritiser from "../agents/audit-prioritiser.js";
import { mergeImprovements, formatSummary } from "./merge-improvements.js";

const ac = new AbortController();
process.once("SIGINT", () => {
  console.error("\n^C - aborting...");
  ac.abort();
});

function asStringArgs(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)]));
}

async function main(): Promise<void> {
  console.log("→ scanning repo");
  // repoScanner is object-form (no inputs), so it goes straight to runAgent.
  const scan = await runAgent(repoScanner, {}, { config, signal: ac.signal });
  const findingsJson = scan.outputs?.findings_json;
  if (!findingsJson) {
    throw new Error("repo-scanner produced no findings_json output");
  }

  console.log("→ prioritising findings");
  // auditPrioritiser is factory-form: call to get a StepInvocation, then
  // thread its agent + resolved args through runAgent.
  const inv = auditPrioritiser({ findings_json: findingsJson });
  const ranked = await runAgent(inv.agent, asStringArgs(inv.args), {
    config,
    signal: ac.signal,
  });
  const rankedJson = ranked.outputs?.ranked_json;
  if (!rankedJson) {
    throw new Error("audit-prioritiser produced no ranked_json output");
  }

  console.log("→ merging into IMPROVEMENTS.md");
  const summary = mergeImprovements(rankedJson);
  console.log(formatSummary(summary));
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
