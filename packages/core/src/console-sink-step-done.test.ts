import { ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { consoleSink } from "./event-sink.js";
import type { AgentMetrics } from "./schema.js";

// Minimal AgentMetrics factory for consoleSink tests
function makeMetrics(
  overrides: Partial<{
    duration_ms: number;
    estimated_cost_usd: number;
    model: string;
    cost_was_reported: boolean;
    input_tokens: number;
    output_tokens: number;
    status: string;
  }> = {},
): AgentMetrics {
  return {
    agent: "test-agent",
    model: overrides.model ?? "claude-test",
    model_tier: "light" as const,
    workflow_id: null,
    step_id: null,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: overrides.duration_ms ?? 1500,
    input_tokens: overrides.input_tokens ?? 3000,
    output_tokens: overrides.output_tokens ?? 2000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: overrides.estimated_cost_usd ?? 0.0234,
    cost_was_reported: overrides.cost_was_reported ?? true,
    status: (overrides.status ?? "success") as "success" | "failure",
    exit_code: 0,
  };
}

function captureConsole(fn: () => void): string {
  const lines: string[] = [];
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  console.warn = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  // Strip ANSI colour codes so assertions don't depend on picocolors output.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return lines.join("\n").replace(ansi, "");
}

describe("consoleSink step-done", () => {
  it("shows USD when costWasReported && showPricing", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "step-done",
        stepId: "step-1",
        output: "",
        metrics: makeMetrics({
          estimated_cost_usd: 0.0234,
          cost_was_reported: true,
          input_tokens: 3000,
          output_tokens: 2000,
        }),
        showPricing: true,
      }),
    );
    ok(out.includes("$0.0234 USD"), `expected USD, got: ${out}`);
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
  });

  it("hides USD when showPricing is false", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "step-done",
        stepId: "step-1",
        output: "",
        metrics: makeMetrics({
          estimated_cost_usd: 0.0234,
          cost_was_reported: true,
          input_tokens: 3000,
          output_tokens: 2000,
        }),
        showPricing: false,
      }),
    );
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
    ok(!out.includes("USD"), `did not expect USD, got: ${out}`);
  });

  it("hides USD when costWasReported is false even if showPricing is true", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "step-done",
        stepId: "step-1",
        output: "",
        metrics: makeMetrics({ cost_was_reported: false, input_tokens: 3000, output_tokens: 2000 }),
        showPricing: true,
      }),
    );
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
  });

  it("renders ✗ when the agent itself failed", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "step-done",
        stepId: "step-1",
        output: "",
        metrics: makeMetrics({ status: "failure" }),
        showPricing: false,
      }),
    );
    ok(out.includes("✗ step-1"), `expected fail mark, got: ${out}`);
    ok(!out.includes("✓"), `did not expect tick, got: ${out}`);
  });

  it("renders ✓ when the agent succeeded and there is no critic verdict", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "step-done",
        stepId: "step-1",
        output: "",
        metrics: makeMetrics({ status: "success" }),
        showPricing: false,
      }),
    );
    ok(out.includes("✓ step-1"), `expected tick, got: ${out}`);
    ok(!out.includes("✗"), `did not expect fail mark, got: ${out}`);
  });
});

describe("consoleSink workflow-done", () => {
  const baseResult = {
    workflowName: "flow-1",
    success: true,
    totalCost: 0.0567,
    totalTokens: 12000,
    costWasReported: true,
    durationMs: 2000,
    stepCount: 3,
  };

  it("shows SUCCESS and tokens line (pricing is caller-side)", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-done",
        workflow: "flow-1",
        result: baseResult,
      }),
    );
    ok(out.includes("SUCCESS"), `expected SUCCESS, got: ${out}`);
    ok(out.includes("tokens: 12k"), `expected tokens line, got: ${out}`);
  });

  it("shows FAILED when success is false", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-done",
        workflow: "flow-1",
        result: { ...baseResult, success: false },
      }),
    );
    ok(out.includes("FAILED"), `expected FAILED, got: ${out}`);
  });
});

describe("consoleSink workflow-start", () => {
  it("renders weekly metrics line when provided", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "flow-1",
        stepCount: 3,
        isolation: { mode: "local" },
        weeklyMetrics: "7d · 12 calls · 250k tok",
      }),
    );
    ok(out.includes("7d · 12 calls · 250k tok"), `expected weekly line, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count in parens, got: ${out}`);
  });

  it("shows the 'workflow' label when the folder doesn't contain 'workflow'", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "special/improve",
        stepCount: 3,
        isolation: { mode: "local" },
      }),
    );
    ok(out.includes("workflow special/improve"), `expected label prefix, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count, got: ${out}`);
  });

  it("shows the 'workflow' label when there is no folder", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "improve",
        stepCount: 3,
        isolation: { mode: "local" },
      }),
    );
    ok(out.includes("workflow improve"), `expected label prefix, got: ${out}`);
  });

  it("hides the 'workflow' label when the folder already contains 'workflow'", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "workflows/improve",
        stepCount: 3,
        isolation: { mode: "local" },
      }),
    );
    ok(!out.includes("workflow workflows/improve"), `did not expect label prefix, got: ${out}`);
    ok(out.includes("workflows/improve"), `expected name, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count, got: ${out}`);
  });

  it("renders prompt log path when provided", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "flow-1",
        stepCount: 3,
        isolation: { mode: "local" },
        promptLogFile: "/tmp/abs/prompts.log",
      }),
    );
    ok(out.includes("prompts.log"), `expected prompt path, got: ${out}`);
    ok(!out.includes("7d ·"), `did not expect weekly line, got: ${out}`);
  });

  it("omits both lines when neither is provided", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "flow-1",
        stepCount: 3,
        isolation: { mode: "local" },
      }),
    );
    ok(!out.includes("7d ·"), `did not expect weekly line, got: ${out}`);
    ok(!out.includes("prompts"), `did not expect prompt path, got: ${out}`);
  });

  it("renders 'local' when isolation mode is local", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "flow-1",
        stepCount: 3,
        isolation: { mode: "local" },
      }),
    );
    ok(out.includes("local"), `expected local marker, got: ${out}`);
    ok(!out.includes("worktree:"), `did not expect worktree marker, got: ${out}`);
  });

  it("renders worktree path when isolation mode is worktree", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "workflow-start",
        workflow: "flow-1",
        stepCount: 3,
        isolation: { mode: "worktree", path: "/tmp/repo-worktrees/wt-123" },
      }),
    );
    ok(out.includes("worktree:"), `expected worktree marker, got: ${out}`);
    ok(out.includes("wt-123"), `expected worktree path, got: ${out}`);
  });
});

describe("consoleSink agent-welcome", () => {
  it("renders weekly metrics and prompt log lines together", () => {
    const out = captureConsole(() =>
      consoleSink({
        type: "agent-welcome",
        agent: "writer",
        agentType: "worker",
        description: "writes things",
        model: "claude-x",
        promptLogFile: "/tmp/abs/prompts.log",
        weeklyMetrics: "7d · 5 calls · 10k tok",
      }),
    );
    ok(out.includes("7d · 5 calls · 10k tok"), `expected weekly line, got: ${out}`);
    ok(out.includes("prompts.log"), `expected prompt path, got: ${out}`);
  });
});

describe("consoleSink agent-stream (formatBinInvocation)", () => {
  function streamOut(command: string): string {
    return captureConsole(() =>
      consoleSink({
        type: "agent-stream",
        stepId: null,
        event: { type: "tool_use", name: "Bash", input: { command } },
      }),
    );
  }

  it("returns generic tool line for non-bin Bash commands", () => {
    const out = streamOut("ls -la");
    ok(out.includes("Bash"), `expected Bash tool name, got: ${out}`);
    ok(!out.includes("Halted"), `did not expect halt phrase, got: ${out}`);
  });

  it("formats emit --halt as a halt phrase", () => {
    const out = streamOut('/abs/packages/core/bin/emit --halt "no unbuilt ideas in NOTES.md"');
    ok(
      out.includes('Halted with reason: "no unbuilt ideas in NOTES.md"'),
      `expected halt phrase, got: ${out}`,
    );
  });

  it("formats emit success outputs as key=value pairs", () => {
    const out = streamOut(
      '/abs/bin/emit --spec_filepath "/tmp/SPEC.md" --instructions "build a thing"',
    );
    ok(
      out.includes('Outputs emitted: spec_filepath="/tmp/SPEC.md", instructions="build a thing"'),
      `expected outputs line, got: ${out}`,
    );
  });

  it("formats no-arg emit as a step-complete phrase", () => {
    const out = streamOut("/abs/bin/emit");
    ok(
      out.includes("Step complete (no outputs declared)"),
      `expected step-complete phrase, got: ${out}`,
    );
  });

  it("formats verdict approve", () => {
    const out = streamOut("/abs/bin/verdict approve");
    ok(out.includes("Verdict: approve"), `expected approve, got: ${out}`);
  });

  it("formats verdict reject", () => {
    const out = streamOut(
      '/abs/bin/verdict reject "missing tests" "no test for X" "no test for Y"',
    );
    ok(
      out.includes('Verdict: reject - "missing tests" (2 issues)'),
      `expected reject phrase, got: ${out}`,
    );
  });

  it("formats params with plan name and instructions", () => {
    const out = streamOut('/abs/bin/params "ship-it" "open a PR for the work"');
    ok(
      out.includes('Plan params: ship-it - "open a PR for the work"'),
      `expected params phrase, got: ${out}`,
    );
  });

  it("truncates very long emit values", () => {
    const long = "x".repeat(200);
    const out = streamOut(`/abs/bin/emit --note "${long}"`);
    ok(out.includes("..."), `expected truncation, got: ${out}`);
    ok(out.length < 400, `expected shorter output, got length: ${out.length}`);
  });
});
