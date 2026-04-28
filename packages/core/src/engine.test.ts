import { rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { runWorkflow } from "./engine.js";
import { EnvProfileError } from "./env-profile.js";
import type { GlobalConfig } from "./schema.js";

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
  verboseOutput: false,
  maxCriticRetries: 3,
};

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
