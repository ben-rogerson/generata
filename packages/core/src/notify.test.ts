import { ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAgentNotification, formatWorkflowNotification } from "./notify.js";
import type { AgentMetrics } from "./schema.js";
import type { WorkflowResult } from "./engine.js";

const baseMetrics: AgentMetrics = {
  agent: "demo",
  model: "claude-haiku-4-5",
  model_tier: "light",
  workflow_id: null,
  step_id: null,
  started_at: "2026-04-27T00:00:00.000Z",
  completed_at: "2026-04-27T00:00:01.000Z",
  duration_ms: 1000,
  input_tokens: 4000,
  output_tokens: 1000,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  estimated_cost_usd: 0.0234,
  cost_was_reported: true,
  status: "success",
  exit_code: 0,
};

const baseWorkflow: WorkflowResult = {
  workflowName: "demo-flow",
  success: true,
  steps: [],
  totalCost: 0.0567,
  totalTokens: 12000,
  costWasReported: true,
  durationMs: 2000,
  haltReason: undefined,
};

describe("formatAgentNotification", () => {
  it("shows USD when showPricing is true", () => {
    const out = formatAgentNotification("demo", baseMetrics, undefined, true);
    ok(out.includes("$0.0234"), `expected dollar amount, got: ${out}`);
    ok(!out.includes("k tok"), `did not expect token fallback, got: ${out}`);
  });

  it("shows tokens when showPricing is false", () => {
    const out = formatAgentNotification("demo", baseMetrics, undefined, false);
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar amount, got: ${out}`);
  });

  it("shows tokens when cost was not reported even if showPricing is true", () => {
    const out = formatAgentNotification(
      "demo",
      { ...baseMetrics, cost_was_reported: false },
      undefined,
      true,
    );
    ok(out.includes("5k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar amount, got: ${out}`);
  });
});

describe("formatWorkflowNotification", () => {
  it("shows USD when showPricing is true", () => {
    const out = formatWorkflowNotification(baseWorkflow, true);
    ok(out.includes("$0.0567"), `expected dollar amount, got: ${out}`);
    ok(!out.includes("k tok"), `did not expect token fallback, got: ${out}`);
  });

  it("shows tokens when showPricing is false", () => {
    const out = formatWorkflowNotification(baseWorkflow, false);
    ok(out.includes("12k tok"), `expected token count, got: ${out}`);
    ok(!out.includes("$"), `did not expect dollar amount, got: ${out}`);
  });
});
