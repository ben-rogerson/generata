import { ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { logStepDone, logWorkflowResult } from "./logger.js";

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
