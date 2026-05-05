import { equal } from "node:assert/strict";
import { describe, it } from "node:test";
import { consoleSink } from "./event-sink.js";
import type { AgentMetrics } from "./schema.js";

function captureStdout(fn: () => void): string {
  const captured: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...parts: unknown[]) => {
    captured.push(parts.map((p) => String(p)).join(" "));
  };
  console.warn = (...parts: unknown[]) => {
    captured.push(parts.map((p) => String(p)).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  return captured.join("\n");
}

// Strip ANSI for stable assertions; consoleSink uses picocolors which
// honours NO_COLOR. We strip rather than depend on env to keep tests
// deterministic across CI.
function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, "");
}

const baseMetrics: AgentMetrics = {
  agent: "demo",
  model: "claude-x",
  model_tier: "light",
  workflow_id: null,
  step_id: null,
  started_at: "",
  completed_at: "",
  duration_ms: 1500,
  input_tokens: 100,
  output_tokens: 200,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  estimated_cost_usd: 0,
  cost_was_reported: false,
  status: "success",
  exit_code: 0,
};

describe("consoleSink", () => {
  it("renders workflow-start with isolation and step count", () => {
    const out = captureStdout(() => {
      consoleSink({
        type: "workflow-start",
        workflow: "demo-flow",
        stepCount: 3,
        isolation: { mode: "local" },
      });
    });
    const stripped = stripAnsi(out);
    equal(stripped.includes("workflow demo-flow"), true);
    equal(stripped.includes("(3 steps queued)"), true);
    equal(stripped.includes("local"), true);
  });

  it("renders step-start with index, id, agent, model", () => {
    const out = captureStdout(() => {
      consoleSink({
        type: "step-start",
        stepIndex: 2,
        stepCount: 5,
        stepId: "review",
        agent: "critic-bot",
        agentType: "critic",
        model: "claude-x",
      });
    });
    const stripped = stripAnsi(out);
    equal(stripped.includes("[2/5]"), true);
    equal(stripped.includes("review"), true);
    equal(stripped.includes("critic-bot"), true);
    equal(stripped.includes("claude-x"), true);
  });

  it("renders step-done success and failure differently", () => {
    const okOut = stripAnsi(
      captureStdout(() => {
        consoleSink({
          type: "step-done",
          stepId: "ok-step",
          output: "",
          metrics: { ...baseMetrics, status: "success" },
          showPricing: false,
        });
      }),
    );
    equal(okOut.includes("✓ ok-step"), true);

    const failOut = stripAnsi(
      captureStdout(() => {
        consoleSink({
          type: "step-done",
          stepId: "fail-step",
          output: "",
          metrics: { ...baseMetrics, status: "failure" },
          showPricing: false,
        });
      }),
    );
    equal(failOut.includes("✗ fail-step"), true);
  });

  it("renders step-retry as a yellow warning", () => {
    const out = stripAnsi(
      captureStdout(() => {
        consoleSink({ type: "step-retry", stepId: "flaky", attempt: 2 });
      }),
    );
    equal(out.includes("flaky"), true);
    equal(out.includes("attempt 2"), true);
  });

  it("renders agent-stream tool_use events", () => {
    const out = stripAnsi(
      captureStdout(() => {
        consoleSink({
          type: "agent-stream",
          stepId: "x",
          event: { type: "tool_use", name: "Read", input: { file_path: "/tmp/foo.md" } },
        });
      }),
    );
    equal(out.includes("Read"), true);
    equal(out.includes("foo.md"), true);
  });

  it("renders workflow-done summary", () => {
    const out = stripAnsi(
      captureStdout(() => {
        consoleSink({
          type: "workflow-done",
          workflow: "demo",
          result: {
            workflowName: "demo",
            success: true,
            totalCost: 0,
            totalTokens: 1234,
            costWasReported: false,
            durationMs: 5000,
            stepCount: 3,
          },
        });
      }),
    );
    equal(out.includes("[workflow] demo: SUCCESS"), true);
    equal(out.includes("5.0s"), true);
  });

  it("renders isolation-overridden warning", () => {
    const out = stripAnsi(
      captureStdout(() => {
        consoleSink({
          type: "isolation-overridden",
          declared: { worktreeSetup: undefined, sharedPaths: [], cleanup: false } as never,
          used: "none",
        });
      }),
    );
    equal(out.includes("isolation overridden"), true);
  });
});
