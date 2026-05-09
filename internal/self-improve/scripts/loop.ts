// Programmatic loop over the `improve` workflow. Each iteration runs the full
// pick -> spec -> plan -> review -> code -> review -> summarise pipeline
// against a fresh worktree, then ships deterministically (branch + commit +
// changeset + push + PR) using `runShipper`. Successive runs see the previous
// iteration's committed/PR'd state. Stops on:
//   - item-picker emitting --halt (backlog drained), OR
//   - any non-halt step failure (loud stop; we don't silently skip), OR
//   - shipping failure (loud stop; do not silently move on), OR
//   - --max iterations reached (default 5).
// Deferral: when spec-creator halts with "deferred-to-ideas: <slug>" (picked
// item requires a breaking change to @generata/core), the loop moves the
// agent-written `last-idea.md` into `internal/ideas/<today>-<slug>.md`,
// prunes the entry from IMPROVEMENTS.md, and continues to the next iteration.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "@generata/core";
import config from "../generata.config.js";
import improve from "../agents/workflows/improve.js";
import { runShipper, type ShipInputs } from "./ship.js";

const SELF_IMPROVE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(SELF_IMPROVE_DIR, "..", "..");
const IDEAS_DIR = resolve(REPO_ROOT, "internal", "ideas");
const IMPROVEMENTS_PATH = resolve(SELF_IMPROVE_DIR, "IMPROVEMENTS.md");
const LAST_IDEA_PATH = resolve(SELF_IMPROVE_DIR, "last-idea.md");

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

function todayStamp(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Halt reasons surface as "<stepId> halted: <agent-supplied reason>". Match
// loosely so the slug is captured regardless of the surrounding wrapper.
function parseDeferredSlug(haltReason: string | undefined): string | null {
  if (!haltReason) return null;
  const m = haltReason.match(/deferred-to-ideas:\s*([a-z0-9][a-z0-9-]*)/i);
  return m?.[1] ?? null;
}

// Drop the entry whose header is `### <slug> [...]`, plus exactly one adjacent
// `---` separator (the one immediately after, or - if last entry - the one
// before). Returns true if the entry was found and removed.
function pruneImprovementEntry(slug: string): boolean {
  if (!existsSync(IMPROVEMENTS_PATH)) return false;
  const content = readFileSync(IMPROVEMENTS_PATH, "utf-8");
  const lines = content.split("\n");
  const headerRe = new RegExp(`^### ${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[`);
  const startIdx = lines.findIndex((l) => headerRe.test(l));
  if (startIdx === -1) return false;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^### [a-z0-9-]+ \[/.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }
  // endIdx is the line after the entry's last line. The separator (if any) is
  // either inside [startIdx, endIdx) (a `---` line) or - for the final entry -
  // immediately before startIdx.
  let removeStart = startIdx;
  let removeEnd = endIdx;
  const lastSepIn = (() => {
    for (let i = endIdx - 1; i > startIdx; i--) {
      if (lines[i]!.trim() === "---") return i;
    }
    return -1;
  })();
  if (lastSepIn !== -1) {
    removeEnd = lastSepIn + 1;
    if (removeEnd < lines.length && lines[removeEnd] === "") removeEnd++;
  } else {
    for (let i = startIdx - 1; i >= 0; i--) {
      if (lines[i]!.trim() === "---") {
        removeStart = i;
        break;
      }
      if (lines[i]!.trim() !== "") break;
    }
  }
  const next = [...lines.slice(0, removeStart), ...lines.slice(removeEnd)];
  writeFileSync(IMPROVEMENTS_PATH, next.join("\n"));
  return true;
}

// Move the agent-written last-idea.md into internal/ideas/, dating + slugging
// the filename. Skips if the destination already exists.
function moveDeferredIdea(slug: string): { written: string; skipped: false } | { skipped: true } {
  // last-idea.md is auto-created (empty) by the worktree sharedPath setup, so
  // existence alone doesn't prove the agent wrote anything; require non-empty.
  if (!existsSync(LAST_IDEA_PATH) || readFileSync(LAST_IDEA_PATH, "utf-8").trim() === "") {
    throw new Error(
      `spec-creator deferred '${slug}' but did not write content to ${LAST_IDEA_PATH}`,
    );
  }
  mkdirSync(IDEAS_DIR, { recursive: true });
  const filename = `${todayStamp()}-${slug}.md`;
  const dest = resolve(IDEAS_DIR, filename);
  if (existsSync(dest)) {
    return { skipped: true };
  }
  renameSync(LAST_IDEA_PATH, dest);
  return { written: dest, skipped: false };
}

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
      const deferredSlug = parseDeferredSlug(result.haltReason);
      if (deferredSlug) {
        const moved = moveDeferredIdea(deferredSlug);
        const pruned = pruneImprovementEntry(deferredSlug);
        if ("written" in moved) {
          console.log(`iteration ${i} deferred '${deferredSlug}' to ${moved.written}`);
        } else {
          console.log(`iteration ${i} deferred '${deferredSlug}'; idea file already exists - kept`);
        }
        if (!pruned) {
          console.warn(
            `  warning: '${deferredSlug}' not found in IMPROVEMENTS.md (already removed?)`,
          );
        }
        continue;
      }
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
