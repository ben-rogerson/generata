import { equal, ok } from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { RunOptions, RunResult } from "./agent-runner.js";
import { defineAgent, defineWorkflow } from "./define.js";
import { runWorkflow } from "./engine.js";
import type { GlobalConfig } from "./schema.js";

const cfg: GlobalConfig = {
  modelTiers: { heavy: "h", standard: "s", light: "l" },
  workDir: "",
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

describe("loop integration", () => {
  it("runs a sub-workflow per item and surfaces the manifest path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-int-"));
    try {
      const reviewer = defineAgent({
        type: "worker",
        description: "reviewer",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: ({ file }) => `review ${file}`,
      });
      (reviewer as { name: string }).name = "reviewer";

      const reviewNote = defineWorkflow({
        description: "review one note",
        required: ["file"],
      })
        .step("read", reviewer)
        .build();
      (reviewNote as { name: string }).name = "review-note";

      const summariser = defineAgent({
        type: "worker",
        description: "summariser",
        modelTier: "light",
        tools: [],
        permissions: "full",
        timeoutSeconds: 60,
        promptContext: [],
        prompt: ({ manifest_path }) => `summarise ${manifest_path}`,
      });
      (summariser as { name: string }).name = "summariser";

      const outer = defineWorkflow({ description: "outer" })
        .step("reviews", reviewNote, {
          each: { items: () => ["a.md", "b.md"] },
          as: "file",
        })
        .step("summary", ({ reviews_manifest }) => ({
          kind: "step-invocation" as const,
          agent: summariser,
          args: { manifest_path: reviews_manifest },
        }))
        .build();
      (outer as { name: string }).name = "outer";

      const calls: string[] = [];
      const fakeRunAgent = async (opts: RunOptions): Promise<RunResult> => {
        calls.push(`${opts.agent.name}:${JSON.stringify(opts.args)}`);
        const now = new Date().toISOString();
        return {
          output: "done",
          metrics: {
            agent: opts.agent.name,
            model: "fake",
            model_tier: "light",
            workflow_id: null,
            step_id: null,
            started_at: now,
            completed_at: now,
            duration_ms: 1,
            input_tokens: 1,
            output_tokens: 1,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            estimated_cost_usd: 0,
            cost_was_reported: false,
            status: "success",
            exit_code: 0,
          },
        };
      };

      const result = await runWorkflow(outer, {}, cfg, dir, undefined, {
        runAgent: fakeRunAgent,
      });

      equal(result.success, true);
      // Two reviewer calls (one per item) + one summariser call.
      equal(calls.filter((c) => c.startsWith("reviewer:")).length, 2);
      equal(calls.filter((c) => c.startsWith("summariser:")).length, 1);

      const manifestDir = join(dir, ".generata", "loops");
      const files = readdirSync(manifestDir);
      equal(files.length, 1);
      const manifest = JSON.parse(readFileSync(join(manifestDir, files[0]), "utf8"));
      equal(manifest.items.length, 2);
      equal(manifest.items[0].vars.file, "a.md");
      equal(manifest.items[1].vars.file, "b.md");

      // Summariser saw the manifest path.
      ok(calls[2].includes(".generata/loops/"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
