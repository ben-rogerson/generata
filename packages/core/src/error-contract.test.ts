import { rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { executeWorkflow } from "./engine.js";
import { GenerataPrecheckError } from "./errors.js";
import type { GlobalConfig } from "./schema.js";

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

    await rejects(
      executeWorkflow(w, {}, { config: stubConfig, cwd: "/tmp" }),
      (err: Error) => {
        if (!(err instanceof GenerataPrecheckError)) return false;
        if (err.workflow !== "wf") return false;
        if (err.issues.length === 0) return false;
        return true;
      },
    );
  });
});
