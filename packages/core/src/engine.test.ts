import { equal, match, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunOptions, RunResult } from "./agent-runner.js";
import { defineAgent, defineWorkflow } from "./define.js";
import { isStructuralHalt, runWorkflow } from "./engine.js";
import { EnvProfileError } from "./env-profile.js";
import type { AgentMetrics, GlobalConfig } from "./schema.js";
import type { SetupWorktreeOptions, SetupWorktreeResult } from "./worktree.js";

function withName<T>(def: T, name: string): T {
  (def as unknown as { name: string }).name = name;
  return def;
}

const stubConfig: GlobalConfig = {
  modelTiers: { heavy: "claude-x", standard: "claude-y", light: "claude-z" },
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

function makeMetrics(opts: Partial<AgentMetrics> & { agent: string }): AgentMetrics {
  const now = new Date().toISOString();
  return {
    model: "stub-model",
    model_tier: "light",
    workflow_id: null,
    step_id: null,
    started_at: now,
    completed_at: now,
    duration_ms: 1,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: 0,
    cost_was_reported: false,
    status: "success",
    exit_code: 0,
    ...opts,
  };
}

describe("runWorkflow critic retry short-circuit", () => {
  it("breaks the retry loop when the worker emits STATUS: halt", async () => {
    const callsByStep: Record<string, number> = {};

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const stepId = options.stepId ?? options.agent.name;
      callsByStep[stepId] = (callsByStep[stepId] ?? 0) + 1;

      if (options.agent.type === "worker") {
        // First attempt: succeed (so the critic gets a chance to reject).
        // Subsequent attempts: emit a structural halt that should break the loop.
        const isFirst = callsByStep[stepId] === 1;
        return {
          output: isFirst
            ? "STATUS: complete - did the work"
            : "STATUS: halt - structural conflict between spec and procedure §2",
          metrics: makeMetrics({ agent: options.agent.name }),
        };
      }

      // Critic: always reject so the engine enters the retry loop.
      return {
        output: "rejected",
        metrics: makeMetrics({ agent: options.agent.name }),
        verdict: { verdict: "reject", summary: "needs changeset", issues: ["missing changeset"] },
      };
    };

    const worker = withName(
      defineAgent({
        type: "worker",
        description: "stub worker",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        promptTemplate: () => "do the thing",
      }),
      "code",
    );

    const critic = withName(
      defineAgent({
        type: "critic",
        description: "stub critic",
        modelTier: "light",
        tools: [],
        permissions: "read-only",
        timeoutSeconds: 60,
        promptContext: [],
        promptTemplate: () => "review the thing",
      }),
      "review-code",
    );

    const workflow = withName(
      defineWorkflow({
        description: "halt-loop",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: [
          { id: "code", agent: worker },
          { id: "review-code", agent: critic, maxRetries: 5 },
        ] as any,
      }),
      "halt-loop",
    );

    const result = await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    // Worker should run: 1 initial + 1 retry = 2 total. Without the short-circuit it would
    // run 1 + 5 = 6, since the critic always rejects.
    equal(callsByStep.code, 2);
    equal(result.success, false);
    equal(result.halted, true);
    match(result.haltReason ?? "", /needs changeset/);
  });
});

describe("runWorkflow critic no-verdict retry", () => {
  function buildWorkflow(maxRetries: number) {
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "stub worker",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        promptTemplate: () => "do the thing",
      }),
      "code",
    );
    const critic = withName(
      defineAgent({
        type: "critic",
        description: "stub critic",
        modelTier: "light",
        tools: [],
        permissions: "read-only",
        timeoutSeconds: 60,
        promptContext: [],
        promptTemplate: () => "review the thing",
      }),
      "review-code",
    );
    return withName(
      defineWorkflow({
        description: "no-verdict",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: [
          { id: "code", agent: worker },
          { id: "review-code", agent: critic, maxRetries },
        ] as any,
      }),
      "no-verdict",
    );
  }

  it("re-runs only the critic when verdict is missing, then approves", async () => {
    const callsByStep: Record<string, number> = {};
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const stepId = options.stepId ?? options.agent.name;
      callsByStep[stepId] = (callsByStep[stepId] ?? 0) + 1;
      if (options.agent.type === "worker") {
        return {
          output: "STATUS: complete",
          metrics: makeMetrics({ agent: options.agent.name }),
        };
      }
      // Critic: first 2 calls return no verdict (transient hang), 3rd approves.
      const attempt = callsByStep[stepId];
      if (attempt < 3) {
        return { output: "", metrics: makeMetrics({ agent: options.agent.name }) };
      }
      return {
        output: "ok",
        metrics: makeMetrics({ agent: options.agent.name }),
        verdict: { verdict: "approve", summary: "", issues: [] },
      };
    };

    const result = await runWorkflow(buildWorkflow(3), {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(callsByStep.code, 1);
    equal(callsByStep["review-code"], 3);
    equal(result.success, true);
    equal(result.halted, undefined);
  });

  it("halts after maxRetries critic re-runs when verdict never arrives", async () => {
    const callsByStep: Record<string, number> = {};
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const stepId = options.stepId ?? options.agent.name;
      callsByStep[stepId] = (callsByStep[stepId] ?? 0) + 1;
      if (options.agent.type === "worker") {
        return {
          output: "STATUS: complete",
          metrics: makeMetrics({ agent: options.agent.name }),
        };
      }
      return { output: "", metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const result = await runWorkflow(buildWorkflow(2), {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    // Worker once, critic 1 + 2 retries = 3 total.
    equal(callsByStep.code, 1);
    equal(callsByStep["review-code"], 3);
    equal(result.success, false);
    equal(result.halted, true);
    match(result.haltReason ?? "", /critic produced no verdict/);
  });
});

describe("isStructuralHalt", () => {
  it("matches the canonical STATUS: halt prefix", () => {
    equal(isStructuralHalt("STATUS: halt - plan requests out-of-scope edit"), true);
  });

  it("matches when STATUS: halt appears after other lines", () => {
    equal(isStructuralHalt("Some preamble.\nSTATUS: halt - reason"), true);
  });

  it("tolerates extra whitespace and case variation", () => {
    equal(isStructuralHalt("status:   halt - whatever"), true);
    equal(isStructuralHalt("STATUS:halt - no space"), true);
  });

  it("does not match STATUS: complete", () => {
    equal(isStructuralHalt("STATUS: complete - all good"), false);
  });

  it("does not match STATUS: partial", () => {
    equal(isStructuralHalt("STATUS: partial - blocked on creds"), false);
  });

  it("does not match a halt word that is not the STATUS sentinel", () => {
    equal(isStructuralHalt("the worker should halt here"), false);
    equal(isStructuralHalt("STATUS: halted (past tense)"), false);
  });

  it("does not match an empty or arbitrary output", () => {
    equal(isStructuralHalt(""), false);
    equal(isStructuralHalt("just regular text without any sentinel"), false);
  });
});

describe("runWorkflow workflowId sanitisation", () => {
  it("strips slashes from path-derived workflow names so tmp-file paths stay flat", async () => {
    let captured: string | null | undefined;

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      captured = options.workflowId;
      return {
        output: "done",
        metrics: makeMetrics({ agent: options.agent.name }),
      };
    };

    const worker = withName(
      defineAgent({
        type: "worker",
        description: "stub",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        promptTemplate: () => "go",
      }),
      "go",
    );

    const workflow = withName(
      defineWorkflow({
        description: "nested",
        steps: [{ id: "step", agent: worker }],
      }),
      "workflows/improve",
    );

    await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(typeof captured, "string");
    equal(captured!.includes("/"), false);
    match(captured!, /^workflows-improve-\d+$/);
  });
});

describe("runWorkflow env propagation", () => {
  it("throws EnvProfileError instead of calling process.exit when env resolution fails", async () => {
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "stub",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        envKeys: ["RUNWORKFLOW_TEST_MISSING_KEY"],
        promptContext: [],
        promptTemplate: () => "go",
      }),
      "vaulted",
    );

    // Hide envKeys from precheck on the first read so it passes, then surface
    // a missing key on subsequent reads to drive the engine into resolveEnvProfile.
    let reads = 0;
    Object.defineProperty(worker, "envKeys", {
      get() {
        reads++;
        return reads === 1 ? [] : ["RUNWORKFLOW_TEST_MISSING_KEY"];
      },
      configurable: true,
    });

    const workflow = withName(
      defineWorkflow({
        description: "d",
        steps: [{ id: "go", agent: worker }],
      }),
      "env-prop",
    );

    const prior = process.env.RUNWORKFLOW_TEST_MISSING_KEY;
    delete process.env.RUNWORKFLOW_TEST_MISSING_KEY;
    try {
      await rejects(runWorkflow(workflow, {}, stubConfig, "/tmp"), EnvProfileError);
    } finally {
      if (prior !== undefined) process.env.RUNWORKFLOW_TEST_MISSING_KEY = prior;
    }
  });
});

describe("agent-runner cwd plumbing", () => {
  it("threads RunOptions.cwd through to runAgent", async () => {
    let observedCwd: string | undefined;
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      observedCwd = options.cwd;
      return {
        output: "ok",
        metrics: makeMetrics({ agent: options.agent.name }),
      };
    };
    const worker = withName(
      defineAgent({
        type: "worker", description: "stub", modelTier: "light", tools: [],
        permissions: "none", timeoutSeconds: 60, promptContext: [],
        promptTemplate: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "cwd",
        steps: [{ id: "code", agent: worker }] as any,
      }),
      "cwd",
    );
    // For now, the engine doesn't yet pass cwd. This test exercises the
    // RunOptions type addition and is a placeholder until Task 7 wires it.
    const r: RunResult = await stubRunAgent({
      agent: worker as any, args: {}, config: stubConfig, workDir: "/tmp",
      cwd: "/tmp/worktree",
    });
    equal(r.output, "ok");
    equal(observedCwd, "/tmp/worktree");
  });
});

// Engine accepts a worktree backend via deps.
describe("runWorkflow isolation: worktree", () => {
  function makeStubSetup() {
    let cleanupCalls = 0;
    const cleanup = async () => { cleanupCalls++; };
    const stubSetup = async (opts: SetupWorktreeOptions): Promise<SetupWorktreeResult> => ({
      worktreePath: "/tmp/wt/abc",
      executionRoot: `/tmp/wt/abc/${(opts.workDir.split("/").pop() ?? "")}`,
      cleanup,
    });
    return { stubSetup, getCleanupCalls: () => cleanupCalls };
  }

  it("calls setupWorktree for isolation: 'worktree' and threads executionRoot to agents", async () => {
    const observed: string[] = [];
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      observed.push(options.cwd ?? "");
      return { output: "ok", metrics: makeMetrics({ agent: options.agent.name }) };
    };
    const worker = withName(
      defineAgent({ type: "worker", description: "x", modelTier: "light", tools: [],
        permissions: "none", timeoutSeconds: 60, promptContext: [], promptTemplate: () => "p" }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "wt",
        isolation: "worktree",
        steps: [{ id: "code", agent: worker }] as any,
      }),
      "wt",
    );
    const { stubSetup, getCleanupCalls } = makeStubSetup();
    const result = await runWorkflow(workflow, {}, stubConfig, "/repo/internal/self-improve",
      undefined, { runAgent: stubRunAgent, setupWorktree: stubSetup, mainProjectRoot: "/repo" });
    equal(result.success, true);
    equal(observed[0], "/tmp/wt/abc/self-improve");
    equal(getCleanupCalls(), 1);
  });

  it("calls cleanup even when a step fails", async () => {
    const stubRunAgent = async (_options: RunOptions): Promise<RunResult> => {
      throw new Error("boom");
    };
    const worker = withName(
      defineAgent({ type: "worker", description: "x", modelTier: "light", tools: [],
        permissions: "none", timeoutSeconds: 60, promptContext: [], promptTemplate: () => "p" }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "wt-fail",
        isolation: "worktree",
        steps: [{ id: "code", agent: worker }] as any,
      }),
      "wt-fail",
    );
    const { stubSetup, getCleanupCalls } = makeStubSetup();
    await rejects(() =>
      runWorkflow(workflow, {}, stubConfig, "/repo/x", undefined,
        { runAgent: stubRunAgent, setupWorktree: stubSetup, mainProjectRoot: "/repo" }),
    );
    equal(getCleanupCalls(), 1);
  });

  it("does not call setupWorktree for isolation: 'none' (default)", async () => {
    let setupCalls = 0;
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> =>
      ({ output: "ok", metrics: makeMetrics({ agent: options.agent.name }) });
    const stubSetup = async (): Promise<SetupWorktreeResult> => {
      setupCalls++;
      return { worktreePath: "", executionRoot: "", cleanup: async () => {} };
    };
    const worker = withName(
      defineAgent({ type: "worker", description: "x", modelTier: "light", tools: [],
        permissions: "none", timeoutSeconds: 60, promptContext: [], promptTemplate: () => "p" }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "no-wt",
        steps: [{ id: "code", agent: worker }] as any,
      }),
      "no-wt",
    );
    await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined,
      { runAgent: stubRunAgent, setupWorktree: stubSetup });
    equal(setupCalls, 0);
  });
});
