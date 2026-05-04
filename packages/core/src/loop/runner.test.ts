import { describe, it } from "node:test";
import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLoopStep, type LoopStepInput } from "./runner.js";
import type { WorkflowDef, GlobalConfig } from "../schema.js";

const minimalConfig: GlobalConfig = {
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

function fakeSubWorkflow(name: string, required: string[] = []): WorkflowDef {
  return {
    kind: "workflow",
    name,
    description: "x",
    required,
    variables: {},
    isolation: "none",
    steps: [
      {
        id: "noop",
        agent: { type: "worker", name: "n", kind: "agent" } as never,
      },
    ],
  } as never;
}

describe("runLoopStep", () => {
  it("runs the sub-workflow once per item with bound vars and writes the manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-runner-"));
    try {
      const calls: Record<string, unknown>[] = [];
      const fakeRun = async (_wf: WorkflowDef, params: Record<string, unknown>) => {
        calls.push(params);
        return {
          workflowName: "sub",
          steps: [],
          success: true,
          totalCost: 0,
          totalTokens: 0,
          costWasReported: false,
          durationMs: 1,
        };
      };
      const input: LoopStepInput = {
        outerWorkflowName: "outer",
        outerRunId: "run-1",
        step: {
          id: "reviews",
          subWorkflow: fakeSubWorkflow("sub", ["file"]),
          each: { items: () => ["a.md", "b.md"] },
          as: "file",
          concurrency: 1,
          onFailure: "halt",
        },
        outerParams: {},
        builtins: { work_dir: dir, today: "2026-05-04", time: "10:00:00" },
        config: minimalConfig,
        workDir: dir,
      };
      const result = await runLoopStep(input, { runWorkflow: fakeRun });
      ok(result.manifest_path.endsWith("outer-reviews-run-1.json"));
      const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
      equal(manifest.items.length, 2);
      equal(manifest.items[0].vars.file, "a.md");
      equal(manifest.items[1].vars.file, "b.md");
      equal(manifest.items[0].status, "ok");
      deepEqual(
        calls.map((c) => c.file),
        ["a.md", "b.md"],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("under onFailure='halt', stops at the first failed iteration and propagates the error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-runner-"));
    try {
      let invocations = 0;
      const fakeRun = async () => {
        invocations++;
        throw new Error(`boom on call ${invocations}`);
      };
      const input: LoopStepInput = {
        outerWorkflowName: "outer",
        outerRunId: "run-2",
        step: {
          id: "reviews",
          subWorkflow: fakeSubWorkflow("sub", ["file"]),
          each: { items: () => ["a.md", "b.md", "c.md"] },
          as: "file",
          concurrency: 1,
          onFailure: "halt",
        },
        outerParams: {},
        builtins: { work_dir: dir, today: "2026-05-04", time: "10:00:00" },
        config: minimalConfig,
        workDir: dir,
      };
      await rejects(() => runLoopStep(input, { runWorkflow: fakeRun }), /boom/);
      equal(invocations, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("under onFailure='continue', records failures and runs all iterations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-runner-"));
    try {
      let n = 0;
      const fakeRun = async () => {
        n++;
        if (n === 2) throw new Error("boom on 2");
        return {
          workflowName: "sub",
          steps: [],
          success: true,
          totalCost: 0,
          totalTokens: 0,
          costWasReported: false,
          durationMs: 1,
        };
      };
      const input: LoopStepInput = {
        outerWorkflowName: "outer",
        outerRunId: "run-3",
        step: {
          id: "reviews",
          subWorkflow: fakeSubWorkflow("sub", ["file"]),
          each: { items: () => ["a.md", "b.md", "c.md"] },
          as: "file",
          concurrency: 1,
          onFailure: "continue",
        },
        outerParams: {},
        builtins: { work_dir: dir, today: "2026-05-04", time: "10:00:00" },
        config: minimalConfig,
        workDir: dir,
      };
      const result = await runLoopStep(input, { runWorkflow: fakeRun });
      const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
      equal(manifest.items.length, 3);
      equal(manifest.items[0].status, "ok");
      equal(manifest.items[1].status, "failed");
      equal(manifest.items[2].status, "ok");
      ok(manifest.items[1].error.includes("boom on 2"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves source order in manifest with concurrency > 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-runner-"));
    try {
      const delays: Record<string, number> = { "a.md": 30, "b.md": 5, "c.md": 15 };
      const fakeRun = async (_wf: WorkflowDef, params: Record<string, unknown>) => {
        await new Promise((r) => setTimeout(r, delays[params.file as string]));
        return {
          workflowName: "sub",
          steps: [],
          success: true,
          totalCost: 0,
          totalTokens: 0,
          costWasReported: false,
          durationMs: 1,
        };
      };
      const input: LoopStepInput = {
        outerWorkflowName: "outer",
        outerRunId: "run-4",
        step: {
          id: "reviews",
          subWorkflow: fakeSubWorkflow("sub", ["file"]),
          each: { items: () => ["a.md", "b.md", "c.md"] },
          as: "file",
          concurrency: 3,
          onFailure: "halt",
        },
        outerParams: {},
        builtins: { work_dir: dir, today: "2026-05-04", time: "10:00:00" },
        config: minimalConfig,
        workDir: dir,
      };
      const result = await runLoopStep(input, { runWorkflow: fakeRun });
      const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
      deepEqual(
        manifest.items.map((i: { vars: { file: string } }) => i.vars.file),
        ["a.md", "b.md", "c.md"],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aborts at loop start if items violate binding rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-runner-"));
    try {
      const fakeRun = async () => {
        throw new Error("should not be called");
      };
      const input: LoopStepInput = {
        outerWorkflowName: "outer",
        outerRunId: "run-5",
        step: {
          id: "reviews",
          subWorkflow: fakeSubWorkflow("sub", ["file"]),
          each: { items: () => ["a.md", { id: "1" }] as unknown[] },
          as: "file",
          concurrency: 1,
          onFailure: "halt",
        },
        outerParams: {},
        builtins: { work_dir: dir, today: "2026-05-04", time: "10:00:00" },
        config: minimalConfig,
        workDir: dir,
      };
      await rejects(() => runLoopStep(input, { runWorkflow: fakeRun }), /mixed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
