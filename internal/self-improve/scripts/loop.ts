// Programmatic loop over the `improve` workflow. Each iteration runs the full
// pick -> spec -> plan -> review -> code -> review -> summarise -> ship pipeline
// against a fresh worktree, so successive runs see the previous iteration's
// committed/PR'd state. Stops on:
//   - item-picker emitting --halt (backlog drained), OR
//   - any non-halt step failure (loud stop; we don't silently skip), OR
//   - --max iterations reached (default 5).

import { runWorkflow } from "@generata/core";
import config from "../generata.config.js";
import improve from "../agents/workflows/improve.js";

const DEFAULT_MAX = 5;

function parseMax(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max") {
      const raw = argv[i + 1];
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--max must be a positive integer, got '${raw ?? "<missing>"}'`);
      }
      return n;
    }
    if (a.startsWith("--max=")) {
      const raw = a.slice("--max=".length);
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--max must be a positive integer, got '${raw}'`);
      }
      return n;
    }
  }
  return DEFAULT_MAX;
}

const ac = new AbortController();
process.once("SIGINT", () => {
  console.error("\n^C - aborting...");
  ac.abort();
});

const max = parseMax(process.argv.slice(2));

async function main(): Promise<void> {
  let shipped = 0;
  for (let i = 1; i <= max; i++) {
    console.log(`\n=== iteration ${i}/${max} ===`);
    const result = await runWorkflow(improve, {}, { config, signal: ac.signal });

    if (result.halted) {
      console.log(`\nbacklog drained at iteration ${i}: ${result.haltReason ?? "halt"}`);
      break;
    }
    if (!result.success) {
      // Engine returns success:false for steps that exhaust maxRetries. The
      // last step's metrics.error has the diagnostics; surface and stop.
      const last = result.steps.at(-1);
      console.error(
        `\niteration ${i} failed at step '${last?.stepId ?? "?"}': ${last?.metrics.error ?? "unknown error"}`,
      );
      process.exit(1);
    }
    shipped++;
  }
  console.log(`\nloop done - ${shipped} iteration(s) shipped`);
}

try {
  await main();
} catch (err) {
  if ((err as Error).name === "AbortError") {
    console.error("loop cancelled");
    process.exit(130);
  }
  console.error(`loop failed: ${(err as Error).message}`);
  process.exit(1);
}
