// packages/core/src/run-workflow.test.ts
import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { runWorkflow } from "./run.js";
import type { GlobalConfig, AgentMetrics } from "./schema.js";
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

const stubMetrics: AgentMetrics = {
  agent: "stub",
  model: "x",
  model_tier: "light",
  workflow_id: null,
  step_id: null,
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
};

const stubRunAgent = async (options: RunOptions): Promise<RunResult> => ({
  output: `did ${options.agent.name}`,
  metrics: { ...stubMetrics, agent: options.agent.name },
});

describe("runWorkflow (public)", () => {
  it("returns the engine result with a top-level output field", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "do",
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    (w as unknown as { name: string }).name = "wf";

    const result = await runWorkflow(
      w,
      {},
      { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
    );

    equal(result.success, true);
    equal(result.output, "did a");
    equal(result.steps.length, 1);
  });

  it("is silent when no onEvent is provided", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "do",
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    (w as unknown as { name: string }).name = "wf";

    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...parts: unknown[]) => {
      captured.push(parts.map(String).join(" "));
    };
    try {
      await runWorkflow(
        w,
        {},
        { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
      );
    } finally {
      console.log = origLog;
    }
    equal(captured.length, 0, `expected silent run, got: ${captured.join("\n")}`);
  });

  it("calls onEvent in expected order", async () => {
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "do",
    });
    (a as unknown as { name: string }).name = "a";
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    (w as unknown as { name: string }).name = "wf";

    const events: string[] = [];
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        onEvent: (e) => events.push(e.type),
        deps: { runAgent: stubRunAgent },
      },
    );
    ok(events.includes("workflow-start"));
    ok(events.includes("step-start"));
    ok(events.includes("step-done"));
    ok(events.includes("workflow-done"));
    equal(events.indexOf("workflow-start") < events.indexOf("step-start"), true);
    equal(events.indexOf("step-start") < events.indexOf("step-done"), true);
    equal(events.indexOf("step-done") < events.indexOf("workflow-done"), true);
  });
});
