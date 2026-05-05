import { deepEqual, equal, ok, rejects } from "node:assert/strict";
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

  it("does not write to stderr when silent (no onEvent)", async () => {
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

    const stderrCaptured: string[] = [];
    const origErr = console.error;
    console.error = (...parts: unknown[]) => {
      stderrCaptured.push(parts.map(String).join(" "));
    };
    try {
      await runWorkflow(w, {}, { config: stubConfig, cwd: "/tmp" }).catch(() => {
        /* expected throw */
      });
    } finally {
      console.error = origErr;
    }
    deepEqual(stderrCaptured, [], `expected silent stderr, got: ${stderrCaptured.join("\n")}`);
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

describe("error contract: abort signal", () => {
  it("rejects pre-aborted signal with AbortError before any step runs", async () => {
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

    let called = 0;
    const stubRunAgent = async (_opts: RunOptions): Promise<RunResult> => {
      called++;
      throw new Error("should not be called when pre-aborted");
    };

    const ac = new AbortController();
    ac.abort();

    await rejects(
      runWorkflow(
        w,
        {},
        {
          config: stubConfig,
          cwd: "/tmp",
          signal: ac.signal,
          deps: { runAgent: stubRunAgent },
        },
      ),
      (err: Error) => err.name === "AbortError",
    );
    equal(called, 0, "pre-abort must short-circuit before invoking runAgent");
  });

  it("propagates AbortError when signal fires mid-step", async () => {
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

    const ac = new AbortController();
    const stubRunAgent = async (_opts: RunOptions): Promise<RunResult> => {
      // Simulate the worker noticing the signal and rejecting with AbortError,
      // mirroring how agent-runner's spawn handler behaves on abort.
      ac.abort();
      throw new DOMException("Aborted", "AbortError");
    };

    await rejects(
      runWorkflow(
        w,
        {},
        {
          config: stubConfig,
          cwd: "/tmp",
          signal: ac.signal,
          deps: { runAgent: stubRunAgent },
        },
      ),
      (err: Error) => err.name === "AbortError",
    );
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

    const events: { type: string; stepId?: string; reason?: string }[] = [];
    const result = await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        onEvent: (e) => {
          if (e.type === "halt") events.push({ type: e.type, stepId: e.stepId, reason: e.reason });
        },
        deps: { runAgent: stubRunAgent },
      },
    );
    equal(result.halted, true);
    ok(result.haltReason?.includes("blocked by missing input"));
    equal(result.success, false); // halted runs are not "successful" in the engine's sense
    equal(events.length, 1, "halt event must fire once when worker emits --halt");
    equal(events[0].stepId, "only");
    equal(events[0].reason, "blocked by missing input");
  });
});
