import { equal, deepEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkflowDef } from "./schema.js";

const baseStep = {
  id: "s1",
  agent: {
    type: "worker",
    name: "stub",
    description: "x",
    modelTier: "light",
    timeoutSeconds: 60,
    envKeys: [],
    promptContext: [],
    promptTemplate: () => "p",
    tools: [],
    permissions: "full",
    maxRetries: 1,
  },
  args: {},
};

describe("WorkflowDef worktree fields", () => {
  it("defaults isolation to 'none' and other worktree fields to empty/undefined", () => {
    const parsed = WorkflowDef.parse({ description: "d", steps: [baseStep] });
    equal(parsed.isolation, "none");
    deepEqual(parsed.sharedPaths, []);
    equal(parsed.worktreeSetup, undefined);
    equal(parsed.worktreeDir, undefined);
  });

  it("accepts isolation 'worktree' with all related fields", () => {
    const parsed = WorkflowDef.parse({
      description: "d",
      isolation: "worktree",
      worktreeSetup: ["pnpm", "install"],
      sharedPaths: ["IMPROVEMENTS.md", "logs/"],
      worktreeDir: "../wt",
      steps: [baseStep],
    });
    equal(parsed.isolation, "worktree");
    deepEqual(parsed.worktreeSetup, ["pnpm", "install"]);
    deepEqual(parsed.sharedPaths, ["IMPROVEMENTS.md", "logs/"]);
    equal(parsed.worktreeDir, "../wt");
  });

  it("rejects sharedPaths containing traversal, absolute, or .git", () => {
    for (const bad of ["../escape", "/abs", ".git", ".git/config", "subdir/../up"]) {
      throws(
        () =>
          WorkflowDef.parse({
            description: "d",
            isolation: "worktree",
            sharedPaths: [bad],
            steps: [baseStep],
          }),
        /sharedPaths/,
      );
    }
  });

  it("rejects empty worktreeSetup array", () => {
    throws(
      () =>
        WorkflowDef.parse({
          description: "d",
          isolation: "worktree",
          worktreeSetup: [],
          steps: [baseStep],
        }),
      /worktreeSetup/,
    );
  });

  it("rejects unknown isolation values", () => {
    throws(() =>
      WorkflowDef.parse({
        description: "d",
        isolation: "container" as any,
        steps: [baseStep],
      }),
    );
  });
});
