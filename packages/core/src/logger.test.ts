import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBinInvocation,
  logAgentWelcome,
  logStepDone,
  logWorkflowResult,
  logWorkflowStart,
} from "./logger.js";

function captureStdout(fn: () => void): string {
  const original = process.stdout.write.bind(process.stdout);
  let buffer = "";
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  // Strip ANSI colour codes so assertions don't depend on picocolors output.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return buffer.replace(ansi, "");
}

describe("logStepDone", () => {
  it("shows USD when costWasReported && showPricing", () => {
    const out = captureStdout(() =>
      logStepDone("step-1", 1500, 0.0234, "claude-haiku-4-5", undefined, true, 5000, true),
    );
    ok(out.includes("$0.0234 USD"), `expected USD, got: ${out}`);
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
  });

  it("hides USD when showPricing is false", () => {
    const out = captureStdout(() =>
      logStepDone("step-1", 1500, 0.0234, "claude-haiku-4-5", undefined, true, 5000, false),
    );
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
    ok(!out.includes("USD"), `did not expect USD, got: ${out}`);
  });

  it("hides USD when costWasReported is false even if showPricing is true", () => {
    const out = captureStdout(() =>
      logStepDone("step-1", 1500, 0.0234, "claude-haiku-4-5", undefined, false, 5000, true),
    );
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
  });

  it("renders ✗ when the agent itself failed", () => {
    const out = captureStdout(() =>
      logStepDone("step-1", 1500, 0, "claude-haiku-4-5", undefined, false, 5000, false, true),
    );
    ok(out.includes("✗ step-1"), `expected fail mark, got: ${out}`);
    ok(!out.includes("✓"), `did not expect tick, got: ${out}`);
  });

  it("renders ✓ when the agent succeeded and there is no critic verdict", () => {
    const out = captureStdout(() =>
      logStepDone("step-1", 1500, 0, "claude-haiku-4-5", undefined, false, 5000, false, false),
    );
    ok(out.includes("✓ step-1"), `expected tick, got: ${out}`);
    ok(!out.includes("✗"), `did not expect fail mark, got: ${out}`);
  });
});

describe("logWorkflowResult", () => {
  it("shows USD when costWasReported && showPricing", () => {
    const out = captureStdout(() =>
      logWorkflowResult("flow-1", true, 0.0567, 2000, undefined, undefined, true, 12000, true),
    );
    ok(out.includes("cost: $0.0567"), `expected cost line, got: ${out}`);
    ok(!out.includes("tokens:"), `did not expect tokens fallback, got: ${out}`);
  });

  it("shows tokens when showPricing is false", () => {
    const out = captureStdout(() =>
      logWorkflowResult("flow-1", true, 0.0567, 2000, undefined, undefined, true, 12000, false),
    );
    ok(out.includes("tokens: 12k"), `expected tokens line, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
  });

  it("shows tokens when costWasReported is false even if showPricing is true", () => {
    const out = captureStdout(() =>
      logWorkflowResult("flow-1", true, 0.0567, 2000, undefined, undefined, false, 12000, true),
    );
    ok(out.includes("tokens: 12k"), `expected tokens line, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar sign, got: ${out}`);
  });
});

describe("logWorkflowStart", () => {
  it("renders weekly metrics line when provided", () => {
    const out = captureStdout(() =>
      logWorkflowStart("flow-1", 3, undefined, "7d · 12 calls · 250k tok"),
    );
    ok(out.includes("7d · 12 calls · 250k tok"), `expected weekly line, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count in parens, got: ${out}`);
  });

  it("shows the 'workflow' label when the folder doesn't contain 'workflow'", () => {
    const out = captureStdout(() => logWorkflowStart("special/improve", 3));
    ok(out.includes("workflow special/improve"), `expected label prefix, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count, got: ${out}`);
  });

  it("shows the 'workflow' label when there is no folder", () => {
    const out = captureStdout(() => logWorkflowStart("improve", 3));
    ok(out.includes("workflow improve"), `expected label prefix, got: ${out}`);
  });

  it("hides the 'workflow' label when the folder already contains 'workflow'", () => {
    const out = captureStdout(() => logWorkflowStart("workflows/improve", 3));
    ok(!out.includes("workflow workflows/improve"), `did not expect label prefix, got: ${out}`);
    ok(out.includes("workflows/improve"), `expected name, got: ${out}`);
    ok(out.includes("(3 steps queued)"), `expected step count, got: ${out}`);
  });

  it("renders prompt log path when provided", () => {
    const out = captureStdout(() =>
      logWorkflowStart("flow-1", 3, "/tmp/abs/prompts.log", undefined),
    );
    ok(out.includes("prompts.log"), `expected prompt path, got: ${out}`);
    ok(!out.includes("7d ·"), `did not expect weekly line, got: ${out}`);
  });

  it("omits both lines when neither is provided", () => {
    const out = captureStdout(() => logWorkflowStart("flow-1", 3));
    ok(!out.includes("7d ·"), `did not expect weekly line, got: ${out}`);
    ok(!out.includes("prompts"), `did not expect prompt path, got: ${out}`);
  });

  it("renders 'local' when isolation mode is local", () => {
    const out = captureStdout(() =>
      logWorkflowStart("flow-1", 3, undefined, undefined, { mode: "local" }),
    );
    ok(out.includes("local"), `expected local marker, got: ${out}`);
    ok(!out.includes("worktree:"), `did not expect worktree marker, got: ${out}`);
  });

  it("renders worktree path when isolation mode is worktree", () => {
    const out = captureStdout(() =>
      logWorkflowStart("flow-1", 3, undefined, undefined, {
        mode: "worktree",
        path: "/tmp/repo-worktrees/wt-123",
      }),
    );
    ok(out.includes("worktree:"), `expected worktree marker, got: ${out}`);
    ok(out.includes("wt-123"), `expected worktree path, got: ${out}`);
  });
});

describe("logAgentWelcome", () => {
  it("renders weekly metrics and prompt log lines together", () => {
    const out = captureStdout(() =>
      logAgentWelcome(
        "writer",
        "worker",
        "writes things",
        "claude-x",
        undefined,
        "/tmp/abs/prompts.log",
        "7d · 5 calls · 10k tok",
      ),
    );
    ok(out.includes("7d · 5 calls · 10k tok"), `expected weekly line, got: ${out}`);
    ok(out.includes("prompts.log"), `expected prompt path, got: ${out}`);
  });
});

describe("formatBinInvocation", () => {
  it("returns null for non-bin Bash commands", () => {
    equal(formatBinInvocation("ls -la"), null);
    equal(formatBinInvocation("cd /Users/ben && pnpm test"), null);
  });

  it("formats emit --halt as a halt phrase", () => {
    equal(
      formatBinInvocation('/abs/packages/core/bin/emit --halt "no unbuilt ideas in NOTES.md"'),
      'Halted with reason: "no unbuilt ideas in NOTES.md"',
    );
  });

  it("formats emit success outputs as key=value pairs", () => {
    equal(
      formatBinInvocation(
        '/abs/bin/emit --spec_filepath "/tmp/SPEC.md" --instructions "build a thing"',
      ),
      'Outputs emitted: spec_filepath="/tmp/SPEC.md", instructions="build a thing"',
    );
  });

  it("formats no-arg emit as a step-complete phrase", () => {
    equal(formatBinInvocation("/abs/bin/emit"), "Step complete (no outputs declared)");
  });

  it("formats verdict approve and reject", () => {
    equal(formatBinInvocation("/abs/bin/verdict approve"), "Verdict: approve");
    equal(
      formatBinInvocation(
        '/abs/bin/verdict reject "missing tests" "no test for X" "no test for Y"',
      ),
      'Verdict: reject - "missing tests" (2 issues)',
    );
  });

  it("formats params with plan name and instructions", () => {
    equal(
      formatBinInvocation('/abs/bin/params "ship-it" "open a PR for the work"'),
      'Plan params: ship-it - "open a PR for the work"',
    );
  });

  it("truncates very long emit values", () => {
    const long = "x".repeat(200);
    const out = formatBinInvocation(`/abs/bin/emit --note "${long}"`);
    ok(out!.includes("..."), `expected truncation, got: ${out}`);
    ok(out!.length < 200, `expected shorter output, got: ${out}`);
  });
});
