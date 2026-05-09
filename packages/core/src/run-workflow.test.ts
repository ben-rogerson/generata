// packages/core/src/run-workflow.test.ts
import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineAgent, defineWorkflow, worktree } from "./define.js";
import { runWorkflow } from "./run.js";
import { loadRegistry } from "./registry.js";
import type { GlobalConfig, AgentMetrics } from "./schema.js";
import type { EngineEvent } from "./event-sink.js";
import type { RunOptions, RunResult } from "./agent-runner.js";
import type { SetupWorktreeOptions, SetupWorktreeResult } from "./worktree.js";

const HERE = dirname(fileURLToPath(import.meta.url));

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

// Resolution table from spec: every row is exercised here. The setup stub
// records whether worktree machinery ran, so each test asserts the engine
// picked the right branch for the (caller, declared) pair.
describe("isolation resolution matrix", () => {
  function makeWorker() {
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
    return a;
  }

  function makeStubSetup() {
    let calls = 0;
    let lastConfig: SetupWorktreeOptions["config"] | undefined;
    const stubSetup = async (opts: SetupWorktreeOptions): Promise<SetupWorktreeResult> => {
      calls++;
      lastConfig = opts.config;
      return {
        worktreePath: "/tmp/wt/test",
        executionRoot: "/tmp/wt/test",
        cleanup: async () => {},
      };
    };
    return {
      stubSetup,
      getCalls: () => calls,
      getLastConfig: () => lastConfig,
    };
  }

  it("omitted + declared none → none (no setup call, no override event)", async () => {
    const w = defineWorkflow({ description: "" }).step("only", makeWorker()).build();
    (w as unknown as { name: string }).name = "wf";
    const { stubSetup, getCalls } = makeStubSetup();
    const events: string[] = [];
    const r = await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        onEvent: (e) => events.push(e.type),
        deps: { runAgent: stubRunAgent, setupWorktree: stubSetup },
      },
    );
    equal(getCalls(), 0);
    equal(events.includes("isolation-overridden"), false);
    equal(r.success, true);
  });

  it("omitted + declared worktree → declared WorktreeConfig used", async () => {
    const declared = worktree({ cleanup: false });
    const w = defineWorkflow({ description: "", isolation: declared })
      .step("only", makeWorker())
      .build();
    (w as unknown as { name: string }).name = "wf";
    const { stubSetup, getCalls, getLastConfig } = makeStubSetup();
    const events: string[] = [];
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        onEvent: (e) => events.push(e.type),
        deps: {
          runAgent: stubRunAgent,
          setupWorktree: stubSetup,
          mainProjectRoot: "/tmp",
        },
      },
    );
    equal(getCalls(), 1);
    // defineWorkflow re-parses the isolation config via Zod, so the engine sees
    // a structural copy of the declared config rather than the same reference.
    deepEqual(getLastConfig(), { ...declared });
    equal(events.includes("isolation-overridden"), false);
  });

  it("'none' + declared none → none (no override event since nothing changed)", async () => {
    const w = defineWorkflow({ description: "" }).step("only", makeWorker()).build();
    (w as unknown as { name: string }).name = "wf";
    const { stubSetup, getCalls } = makeStubSetup();
    const events: string[] = [];
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        isolation: "none",
        onEvent: (e) => events.push(e.type),
        deps: { runAgent: stubRunAgent, setupWorktree: stubSetup },
      },
    );
    equal(getCalls(), 0);
    equal(events.includes("isolation-overridden"), false);
  });

  it("'none' + declared worktree → none + isolation-overridden event", async () => {
    const w = defineWorkflow({ description: "", isolation: worktree({}) })
      .step("only", makeWorker())
      .build();
    (w as unknown as { name: string }).name = "wf";
    const { stubSetup, getCalls } = makeStubSetup();
    const events: string[] = [];
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        isolation: "none",
        onEvent: (e) => events.push(e.type),
        deps: { runAgent: stubRunAgent, setupWorktree: stubSetup },
      },
    );
    equal(getCalls(), 0);
    ok(events.includes("isolation-overridden"));
  });

  it("WorktreeConfig + declared none → use passed config + isolation-overridden", async () => {
    const w = defineWorkflow({ description: "" }).step("only", makeWorker()).build();
    (w as unknown as { name: string }).name = "wf";
    const passed = worktree({ cleanup: true });
    const { stubSetup, getCalls, getLastConfig } = makeStubSetup();
    const events: string[] = [];
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        isolation: passed,
        onEvent: (e) => events.push(e.type),
        deps: {
          runAgent: stubRunAgent,
          setupWorktree: stubSetup,
          mainProjectRoot: "/tmp",
        },
      },
    );
    equal(getCalls(), 1);
    equal(getLastConfig(), passed);
    ok(events.includes("isolation-overridden"));
  });

  it("does not crash when caller skips manual name-stamping (programmatic default)", async () => {
    // Regression: programmatic callers import a workflow built by
    // defineWorkflow(...).build() and pass it straight to runWorkflow. The
    // CLI registry isn't in play, so the engine used to crash on
    // `workflow.name.replace(...)` because name was never stamped.
    const a = defineAgent({
      type: "worker",
      description: "",
      modelTier: "light",
      tools: [],
      timeoutSeconds: 60,
      maxRetries: 1,
      prompt: "do",
    });
    const w = defineWorkflow({ description: "" }).step("only", a).build();
    // Note: no `(w as ...).name = "wf"` here.

    const result = await runWorkflow(
      w,
      {},
      { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
    );

    equal(result.success, true);
    ok(w.name && w.name.length > 0, `expected non-empty name, got '${w.name}'`);
    ok(result.workflowName.length > 0);
  });

  it("auto-derived names surface in EngineEvent payloads", async () => {
    // The fix has to plumb through to the public event surface, not just sit
    // on the def. Subscribe to onEvent for a fixture-built workflow (no manual
    // name stamps anywhere) and assert workflow-start/-done/step-start carry
    // the auto-derived basename, not "" or undefined.
    const path = "../test/fixtures/programmatic-naming/standup-fixture.js";
    const fix = (await import(path)) as {
      fixtureWorkflow: import("./schema.js").WorkflowDef;
    };

    const events: EngineEvent[] = [];
    await runWorkflow(
      fix.fixtureWorkflow,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        onEvent: (e) => events.push(e),
        deps: { runAgent: stubRunAgent },
      },
    );

    const start = events.find((e) => e.type === "workflow-start");
    const stepStart = events.find((e) => e.type === "step-start");
    const done = events.find((e) => e.type === "workflow-done");
    ok(start && start.type === "workflow-start");
    ok(stepStart && stepStart.type === "step-start");
    ok(done && done.type === "workflow-done");
    equal(start.workflow, "standup-fixture");
    equal(stepStart.agent, "standup-fixture");
    equal(done.workflow, "standup-fixture");
  });

  it("registry-stamped name wins over programmatic auto-derive", async () => {
    // The CLI flow loads workflows/agents via loadRegistry, which post-stamps
    // `name` from path-relative-to-agentsDir. The auto-derive default must not
    // shadow that stamp - otherwise the CLI surface (agent lookup, event
    // payloads, log paths) silently degrades to flat basenames.
    const projectRoot = resolve(HERE, "../test/fixtures/registry-naming");
    const reg = await loadRegistry({ projectRoot, agentsDir: "agents" });

    // The fixture file's basename is `registry-agent` / `registry-wf`. The
    // registry derives `sub/registry-agent` / `workflows/registry-wf` from the
    // path-relative-to-agentsDir. Auto-derive would have given the basename;
    // assert the registry's path-derived name wins.
    ok(
      reg.has("sub/registry-agent"),
      "expected registry to key the agent by its path-derived name",
    );
    ok(
      reg.hasWorkflow("workflows/registry-wf"),
      "expected registry to key the workflow by its path-derived name",
    );
    equal(reg.get("sub/registry-agent").name, "sub/registry-agent");
    equal(reg.getWorkflow("workflows/registry-wf").name, "workflows/registry-wf");
  });

  it("WorkflowResult.workflowName carries the auto-derived name", async () => {
    // Programmatic callers use `result.workflowName` for logging / log
    // routing (see programmatic-example.ts:33). Confirm the result-shape
    // contract holds when no manual name is stamped.
    const path = "../test/fixtures/programmatic-naming/standup-fixture.js";
    const fix = (await import(path)) as {
      fixtureWorkflow: import("./schema.js").WorkflowDef;
    };

    const result = await runWorkflow(
      fix.fixtureWorkflow,
      {},
      { config: stubConfig, cwd: "/tmp", deps: { runAgent: stubRunAgent } },
    );

    equal(result.workflowName, "standup-fixture");
  });

  it("WorktreeConfig + declared worktree → caller's config wins", async () => {
    const declared = worktree({ cleanup: false });
    const passed = worktree({ cleanup: true });
    const w = defineWorkflow({ description: "", isolation: declared })
      .step("only", makeWorker())
      .build();
    (w as unknown as { name: string }).name = "wf";
    const { stubSetup, getCalls, getLastConfig } = makeStubSetup();
    await runWorkflow(
      w,
      {},
      {
        config: stubConfig,
        cwd: "/tmp",
        isolation: passed,
        deps: {
          runAgent: stubRunAgent,
          setupWorktree: stubSetup,
          mainProjectRoot: "/tmp",
        },
      },
    );
    equal(getCalls(), 1);
    equal(getLastConfig(), passed);
  });
});
