import { equal, ok, rejects } from "node:assert/strict";
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

    await rejects(runWorkflow(w, {}, { config: stubConfig, cwd: "/tmp" }), (err: Error) => {
      if (!(err instanceof GenerataPrecheckError)) return false;
      if (err.workflow !== "wf") return false;
      if (err.issues.length === 0) return false;
      return true;
    });
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

describe("error contract: halt", () => {
  it("returns halted:true with reason (no throw)", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "do",
      outputs: { foo: "value" },
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    (w as unknown as { name: string }).name = "wf";

    const stubRunAgent = async (opts: RunOptions): Promise<RunResult> => ({
      output: "",
      metrics: {
        agent: opts.agent.name,
        model: "x",
        model_tier: "light",
        workflow_id: null,
        step_id: opts.stepId ?? null,
        started_at: "",
        completed_at: "",
        duration_ms: 1,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        estimated_cost_usd: 0,
        cost_was_reported: false,
        status: "success",
        exit_code: 0,
      },
      halt: { reason: "blocked by missing input" },
    });

    const result = await runWorkflow(
      w,
      {},
      { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
    );
    equal(result.halted, true);
    ok(result.haltReason?.includes("blocked by missing input"));
    equal(result.success, false); // halted runs are not "successful" in the engine's sense
  });
});
