// Programmatic loop over the `improve` workflow. Each iteration runs the full
// pick -> spec -> plan -> review -> code -> review -> summarise pipeline
// against a fresh worktree, then ships deterministically (branch + commit +
// changeset + push + PR) using `runShipper`. Successive runs see the previous
// iteration's committed/PR'd state. Stops on:
//   - item-picker emitting --halt (backlog drained), OR
//   - any non-halt step failure (loud stop; we don't silently skip), OR
//   - shipping failure (loud stop; do not silently move on), OR
//   - --max iterations reached (default 5).

import { runWorkflow } from "@generata/core";
import config from "../generata.config.js";
import improve from "../agents/workflows/improve.js";
import { runShipper, type ShipInputs } from "./ship.js";

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

function shipInputsFrom(outputs: Record<string, string>, worktreeRoot: string): ShipInputs {
  const required = ["slug", "bump", "commit_subject", "commit_body"] as const;
  for (const key of required) {
    if (!outputs[key]) {
      throw new Error(`workflow finished without emitting '${key}' output - cannot ship`);
    }
  }
  const bump = outputs.bump;
  if (bump !== "patch" && bump !== "minor" && bump !== "none") {
    throw new Error(`unsupported bump '${bump}' - cannot ship`);
  }
  return {
    slug: outputs.slug!,
    bump,
    commitSubject: outputs.commit_subject!,
    commitBody: outputs.commit_body!,
    worktreeRoot,
  };
}

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

    if (!result.worktreePath) {
      console.error(
        `\niteration ${i} succeeded but workflow ran without worktree isolation - refusing to ship`,
      );
      process.exit(1);
    }

    const shipResult = await runShipper(shipInputsFrom(result.outputs, result.worktreePath));
    if (!shipResult.ok) {
      console.error(`\niteration ${i} ship failed: ${shipResult.reason}`);
      process.exit(1);
    }
    console.log(`iteration ${i} shipped: ${shipResult.prUrl}`);
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
