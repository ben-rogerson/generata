import { equal, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { GenerataPrecheckError } from "./errors.js";
import { runWorkflow } from "./run.js";
import type { GlobalConfig } from "./schema.js";
import type { RunOptions, RunResult } from "./agent-runner.js";

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

describe("error contract: precheck", () => {
  it("throws GenerataPrecheckError with structured issues", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "uses {{missing_arg}}",
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "", required: ["missing_arg"] as const })
      .step("only", a)
      .build();
    (w as unknown as { name: string }).name = "wf";

    await rejects(
      runWorkflow(w, {}, { config: stubConfig, cwd: "/tmp" }),
      (err: Error) => {
        if (!(err instanceof GenerataPrecheckError)) return false;
        if (err.workflow !== "wf") return false;
        if (err.issues.length === 0) return false;
        return true;
      },
    );
  });
});

describe("error contract: critic max-retries", () => {
  it("returns success:false instead of throwing", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 2,
      prompt: "do",
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    (w as unknown as { name: string }).name = "wf";

    const stubRunAgent = async (_opts: RunOptions): Promise<RunResult> => {
      throw new Error("simulated transient failure");
    };

    const result = await runWorkflow(
      w,
      {},
      { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
    );
    equal(result.success, false);
    equal(result.steps.length, 1);
    equal(result.steps[0].metrics.status, "failure");
  });
});
