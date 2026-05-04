import { equal, match, ok, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunOptions, RunResult } from "./agent-runner.js";
import { buildPrompt } from "./context-builder.js";
import { defineAgent, defineWorkflow, worktree } from "./define.js";
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
        prompt: () => "do the thing",
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
        prompt: () => "review the thing",
      }),
      "review-code",
    );

    const workflow = withName(
      defineWorkflow({ description: "halt-loop" })
        .step("code", worker)
        .step("review-code", critic, { maxRetries: 5 })
        .build(),
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
        prompt: () => "do the thing",
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
        prompt: () => "review the thing",
      }),
      "review-code",
    );
    return withName(
      defineWorkflow({ description: "no-verdict" })
        .step("code", worker)
        .step("review-code", critic, { maxRetries })
        .build(),
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
        prompt: () => "go",
      }),
      "go",
    );

    const workflow = withName(
      defineWorkflow({ description: "nested" }).step("step", worker).build(),
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
        prompt: () => "go",
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
      defineWorkflow({ description: "d" }).step("go", worker).build(),
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
        type: "worker",
        description: "stub",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    // The workflow construction exercises the type-level chain builder; the
    // test itself drives runAgent directly via the RunOptions surface.
    void withName(
      defineWorkflow({
        description: "cwd",
      })
        .step("code", worker)
        .build(),
      "cwd",
    );
    const r: RunResult = await stubRunAgent({
      agent: worker as any,
      args: {},
      config: stubConfig,
      workDir: "/tmp",
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
    const cleanup = async () => {
      cleanupCalls++;
    };
    const stubSetup = async (opts: SetupWorktreeOptions): Promise<SetupWorktreeResult> => ({
      worktreePath: "/tmp/wt/abc",
      executionRoot: `/tmp/wt/abc/${opts.workDir.split("/").pop() ?? ""}`,
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
      defineAgent({
        type: "worker",
        description: "x",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "wt",
        isolation: worktree({ cleanup: true }),
      })
        .step("code", worker)
        .build(),
      "wt",
    );
    const { stubSetup, getCleanupCalls } = makeStubSetup();
    const result = await runWorkflow(
      workflow,
      {},
      stubConfig,
      "/repo/internal/self-improve",
      undefined,
      { runAgent: stubRunAgent, setupWorktree: stubSetup, mainProjectRoot: "/repo" },
    );
    equal(result.success, true);
    equal(observed[0], "/tmp/wt/abc/self-improve");
    equal(getCleanupCalls(), 1);
  });

  it("preserves the worktree when cleanup is false (default)", async () => {
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => ({
      output: "ok",
      metrics: makeMetrics({ agent: options.agent.name }),
    });
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "x",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "wt-keep",
        isolation: worktree({}),
      })
        .step("code", worker)
        .build(),
      "wt-keep",
    );
    const { stubSetup, getCleanupCalls } = makeStubSetup();
    const result = await runWorkflow(workflow, {}, stubConfig, "/repo/x", undefined, {
      runAgent: stubRunAgent,
      setupWorktree: stubSetup,
      mainProjectRoot: "/repo",
    });
    equal(result.success, true);
    equal(getCleanupCalls(), 0);
  });

  it("calls cleanup even when a step fails", async () => {
    const stubRunAgent = async (_options: RunOptions): Promise<RunResult> => {
      throw new Error("boom");
    };
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "x",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "wt-fail",
        isolation: worktree({ cleanup: true }),
      })
        .step("code", worker)
        .build(),
      "wt-fail",
    );
    const { stubSetup, getCleanupCalls } = makeStubSetup();
    await rejects(() =>
      runWorkflow(workflow, {}, stubConfig, "/repo/x", undefined, {
        runAgent: stubRunAgent,
        setupWorktree: stubSetup,
        mainProjectRoot: "/repo",
      }),
    );
    equal(getCleanupCalls(), 1);
  });

  it("does not call setupWorktree for isolation: 'none' (default)", async () => {
    let setupCalls = 0;
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => ({
      output: "ok",
      metrics: makeMetrics({ agent: options.agent.name }),
    });
    const stubSetup = async (): Promise<SetupWorktreeResult> => {
      setupCalls++;
      return { worktreePath: "", executionRoot: "", cleanup: async () => {} };
    };
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "x",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "no-wt",
      })
        .step("code", worker)
        .build(),
      "no-wt",
    );
    await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
      setupWorktree: stubSetup,
    });
    equal(setupCalls, 0);
  });

  it("respects an explicit isolation override passed to runWorkflow", async () => {
    let setupCalls = 0;
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => ({
      output: "ok",
      metrics: makeMetrics({ agent: options.agent.name }),
    });
    const stubSetup = async (): Promise<SetupWorktreeResult> => {
      setupCalls++;
      return { worktreePath: "", executionRoot: "/forced", cleanup: async () => {} };
    };
    const worker = withName(
      defineAgent({
        type: "worker",
        description: "x",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "p",
      }),
      "code",
    );
    const workflow = withName(
      defineWorkflow({
        description: "no-wt-overridden",
        // declared "none" but overridden to "worktree"
      })
        .step("code", worker)
        .build(),
      "no-wt-overridden",
    );
    await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
      setupWorktree: stubSetup,
      isolationOverride: "worktree",
      mainProjectRoot: "/tmp",
    });
    equal(setupCalls, 1);
  });
});

describe("runWorkflow onReject factory-form", () => {
  it("invokes factory onReject with merged params + step outputs and resolves its closure template", async () => {
    // The reject handler is a factory that interpolates a prior step's output
    // (`scan`) into its prompt. Without engine support it would either be
    // rejected at config time or run with the sentinel-laced static template.
    const captured: Record<string, string> = {};

    const scanner = withName(
      defineAgent({
        type: "worker",
        description: "scanner",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "scan",
      }),
      "scanner",
    );

    const reviewer = withName(
      defineAgent({
        type: "critic",
        description: "always rejects",
        modelTier: "light",
        tools: [],
        permissions: "read-only",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "review",
      }),
      "reviewer",
    );

    const cleanup = withName(
      defineAgent<{ scan: string }>(({ scan, work_dir }) => ({
        type: "worker",
        description: "archives the rejected output",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `cleanup at ${work_dir} of: ${scan}`,
      })),
      "cleanup",
    );

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const prompt = buildPrompt({
        agent: options.agent,
        args: options.args,
        config: options.config,
        workDir: options.workDir,
        stepOutputs: options.stepOutputs,
        workflowVariables: options.workflowVariables,
      });
      const stepId = options.stepId ?? options.agent.name;
      captured[stepId] = prompt;
      if (options.agent.type === "critic") {
        return {
          output: "rejected",
          metrics: makeMetrics({ agent: options.agent.name }),
          verdict: { verdict: "reject", summary: "no good", issues: ["x"] },
        };
      }
      const output = options.agent.name === "scanner" ? "found-the-thing" : "ok";
      return { output, metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const workflow = withName(
      defineWorkflow({ description: "reject-flow" })
        .step("scan", scanner)
        .step("review", reviewer, {
          onReject: ({ scan }) => cleanup({ scan }),
          maxRetries: 1,
        })
        .build(),
      "reject-flow",
    );

    const result = await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(result.success, false);
    equal(result.halted, true);
    // Cleanup ran with scan output and work_dir interpolated through closure
    const cleanupPrompt = captured["review-cleanup"];
    ok(cleanupPrompt, "cleanup ran");
    ok(
      cleanupPrompt.includes("cleanup at /tmp of: found-the-thing"),
      `factory closure not resolved: ${cleanupPrompt}`,
    );
    ok(!cleanupPrompt.includes("__placeholder_"), `sentinel leaked: ${cleanupPrompt}`);
  });
});

describe("runWorkflow first-class halt via outputs", () => {
  it("stops the workflow cleanly when an agent emits --halt: no metric failure, downstream steps skipped, haltReason carries the message", async () => {
    const callsByStep: Record<string, number> = {};

    const halter = withName(
      defineAgent<{ output_dir: string }>(({ output_dir }) => ({
        type: "worker",
        description: "halts on a precondition",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `check ${output_dir}`,
        outputs: { spec_filepath: "Path to SPEC" },
      })),
      "halter",
    );

    const downstream = withName(
      defineAgent({
        type: "worker",
        description: "should not run",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "would do downstream work",
      }),
      "downstream",
    );

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const stepId = options.stepId ?? options.agent.name;
      callsByStep[stepId] = (callsByStep[stepId] ?? 0) + 1;
      if (options.agent.name === "halter") {
        return {
          output: "decided to halt",
          metrics: makeMetrics({ agent: options.agent.name }),
          halt: { reason: "no unbuilt ideas in NOTES.md" },
        };
      }
      return { output: "ran", metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const workflow = withName(
      defineWorkflow({ description: "halt-flow", variables: { output_dir: "p" } })
        .step("first", ({ output_dir }) => halter({ output_dir }))
        .step("second", () => ({
          kind: "step-invocation" as const,
          agent: downstream as never,
          args: {},
        }))
        .build(),
      "halt-flow",
    );

    const result = await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(result.halted, true);
    match(result.haltReason ?? "", /no unbuilt ideas/);
    equal(callsByStep.first, 1);
    equal(callsByStep.second, undefined, "downstream step must not run after halt");
    // Metric must NOT be a failure - halt is structured, not error
    equal(result.steps[0].metrics.status, "success");
    equal(result.success, false, "workflow success is false when halted");
  });
});

describe("runWorkflow agent outputs flow into downstream stepFns", () => {
  it("merges emitted outputs into params so the next step's stepFn destructures them as typed strings", async () => {
    // The first agent declares outputs. The stub runAgent simulates the emit
    // bin having been called by returning RunResult.outputs directly. The
    // second step's stepFn destructures the emitted keys; this fails at type-
    // check time if the chain builder didn't extend TBaseParams from the
    // first step's declared outputs, and at runtime if the engine didn't
    // merge result.outputs into params.
    const captured: Record<string, Record<string, unknown>> = {};

    const emitter = withName(
      defineAgent<{ output_dir: string }>(({ output_dir }) => ({
        type: "worker",
        description: "emits two outputs",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `produce outputs at ${output_dir}`,
        outputs: {
          spec_filepath: "Absolute path to SPEC.md",
          instructions: "One-line summary",
        },
      })),
      "emitter",
    );

    const consumer = withName(
      defineAgent<{ spec_filepath: string; instructions: string }>(
        ({ spec_filepath, instructions }) => ({
          type: "worker",
          description: "consumes the emitted outputs",
          modelTier: "light",
          tools: [],
          permissions: "full",
          timeoutSeconds: 60,
          promptContext: [],
          prompt: `read ${spec_filepath} for: ${instructions}`,
        }),
      ),
      "consumer",
    );

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      captured[options.stepId ?? options.agent.name] = options.args;
      if (options.agent.name === "emitter") {
        return {
          output: "ok",
          metrics: makeMetrics({ agent: options.agent.name }),
          outputs: { spec_filepath: "/abs/SPEC.md", instructions: "build a thing" },
        };
      }
      return { output: "done", metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const workflow = withName(
      defineWorkflow({
        description: "outputs-flow",
        variables: { output_dir: "projects" },
      })
        .step("first", ({ output_dir }) => emitter({ output_dir }))
        // Compile-time check: spec_filepath + instructions must be on the
        // destructure here (added to TBaseParams from the first step's outputs).
        .step("second", ({ spec_filepath, instructions }) =>
          consumer({ spec_filepath, instructions }),
        )
        .build(),
      "outputs-flow",
    );

    const result = await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(result.success, true);
    equal(captured.second.spec_filepath, "/abs/SPEC.md");
    equal(captured.second.instructions, "build a thing");
  });
});

describe("runWorkflow agent failure status fails the workflow", () => {
  it("treats RunResult.metrics.status='failure' as a thrown error so downstream steps don't run with undefined inputs", async () => {
    // Regression: agent-runner sets status='failure' (e.g. claude crash, or
    // declared outputs not emitted) but resolves rather than throws. Without
    // the engine surfacing that, the next step's stepFn destructured undefined
    // values and crashed inside an agent factory (e.g. spec_filepath.replace).
    let secondCalled = false;

    const broken = withName(
      defineAgent<{ output_dir: string }>(({ output_dir }) => ({
        type: "worker",
        description: "would emit but does not",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `${output_dir}`,
        outputs: { spec_filepath: "Absolute path to SPEC.md" },
      })),
      "broken",
    );

    const downstream = withName(
      defineAgent<{ spec_filepath: string }>(({ spec_filepath }) => ({
        type: "worker",
        description: "consumer",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `read ${spec_filepath}`,
      })),
      "downstream",
    );

    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      if (options.agent.name === "broken") {
        return {
          output: "",
          metrics: makeMetrics({
            agent: options.agent.name,
            status: "failure",
            error: "emit missing keys: spec_filepath",
          }),
        };
      }
      secondCalled = true;
      return { output: "", metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const workflow = withName(
      defineWorkflow({ description: "fail-stops", variables: { output_dir: "p" } })
        .step("first", ({ output_dir }) => broken({ output_dir }))
        .step("second", ({ spec_filepath }) => downstream({ spec_filepath }))
        .build(),
      "fail-stops",
    );

    await rejects(
      runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, { runAgent: stubRunAgent }),
      /emit missing keys: spec_filepath/,
    );
    equal(secondCalled, false);
  });
});

describe("runWorkflow with factory-form agent (smoke)", () => {
  it("resolves builtins and prior step output through the factory closure end-to-end", async () => {
    // End-to-end smoke: a factory agent's prompt references both a
    // builtin (today) and a step-output input (picker_output). The stub
    // runAgent invokes the real buildPrompt, so any regression in the
    // closure-vs-sentinel logic shows up as a placeholder leak in capturedPrompt.
    const captured: Record<string, string> = {};

    const picker = withName(
      defineAgent({
        type: "worker",
        description: "p",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: () => "pick something",
      }),
      "picker",
    );

    const factoryAgent = withName(
      defineAgent<{ picker_output: string }>(({ picker_output, today, work_dir }) => ({
        type: "worker",
        description: "spec",
        modelTier: "standard",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: `today=${today}; dir=${work_dir}; picker=${picker_output}`,
      })),
      "spec",
    );

    let pickerOutput = "";
    const stubRunAgent = async (options: RunOptions): Promise<RunResult> => {
      const prompt = buildPrompt({
        agent: options.agent,
        args: options.args,
        config: options.config,
        workDir: options.workDir,
        stepOutputs: options.stepOutputs,
        workflowVariables: options.workflowVariables,
      });
      const stepId = options.stepId ?? options.agent.name;
      captured[stepId] = prompt;
      const output = options.agent.name === "picker" ? "the-picked-thing" : "STATUS: complete";
      if (options.agent.name === "picker") pickerOutput = output;
      return { output, metrics: makeMetrics({ agent: options.agent.name }) };
    };

    const workflow = withName(
      defineWorkflow({ description: "smoke" })
        .step("pick", picker)
        .step("spec", ({ pick }) => factoryAgent({ picker_output: pick }))
        .build(),
      "smoke",
    );

    const result = await runWorkflow(workflow, {}, stubConfig, "/tmp", undefined, {
      runAgent: stubRunAgent,
    });

    equal(result.success, true);
    ok(captured.spec, "spec step captured");
    ok(
      captured.spec.includes(`picker=${pickerOutput}`),
      `picker_output not wired in: ${captured.spec}`,
    );
    ok(captured.spec.includes("dir=/tmp"), `work_dir not wired in: ${captured.spec}`);
    ok(/today=\d{4}-\d{2}-\d{2}/.test(captured.spec), `today not real ISO date: ${captured.spec}`);
    ok(!captured.spec.includes("__placeholder_"), `sentinel leaked: ${captured.spec}`);
  });
});
