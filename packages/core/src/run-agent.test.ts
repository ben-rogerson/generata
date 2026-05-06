// packages/core/src/run-agent.test.ts
import { rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent } from "./define.js";
import { runAgent } from "./run.js";
import type { GlobalConfig } from "./schema.js";

const stubConfig: GlobalConfig = {
  modelTiers: { heavy: "x", standard: "y", light: "z" },
  workDir: "/tmp",
  agentsDir: "agents",
  metricsDir: "metrics",
  logsDir: "logs",
  notifications: false,
  logPrompts: false,
  showPricing: false,
  showWeeklyMetrics: false,
  verboseOutput: false,
  maxCriticRetries: 3,
};

describe("runAgent (public)", () => {
  it("rejects with AbortError when signal is already aborted", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 1,
      maxRetries: 1,
      prompt: "do",
    });
    (a as unknown as { name: string }).name = "a";

    const ac = new AbortController();
    ac.abort();

    await rejects(
      runAgent(a, {}, { config: stubConfig, cwd: "/tmp", signal: ac.signal }),
      (err: Error) => err.name === "AbortError",
    );
  });
});
