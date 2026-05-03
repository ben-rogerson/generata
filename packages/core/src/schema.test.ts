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
    prompt: () => "p",
    tools: [],
    permissions: "full",
    maxRetries: 1,
  },
  args: {},
};

describe("WorkflowDef worktree fields", () => {
  it("defaults isolation to 'none'", () => {
    const parsed = WorkflowDef.parse({ description: "d", steps: [baseStep] });
    equal(parsed.isolation, "none");
  });

  it("accepts isolation as a WorktreeConfig", () => {
    const parsed = WorkflowDef.parse({
      description: "d",
      isolation: {
        worktreeSetup: ["pnpm", "install"],
        sharedPaths: ["IMPROVEMENTS.md", "logs/"],
        worktreeDir: "../wt",
      },
      steps: [baseStep],
    });
    equal(typeof parsed.isolation, "object");
    if (parsed.isolation === "none") throw new Error("expected config");
    deepEqual(parsed.isolation.worktreeSetup, ["pnpm", "install"]);
    deepEqual(parsed.isolation.sharedPaths, ["IMPROVEMENTS.md", "logs/"]);
    equal(parsed.isolation.worktreeDir, "../wt");
    equal(parsed.isolation.baseRef, undefined);
  });

  it("accepts baseRef as remote/branch or bare local branch", () => {
    for (const ref of ["upstream/develop", "main", "feature/wip"]) {
      const parsed = WorkflowDef.parse({
        description: "d",
        isolation: { baseRef: ref },
        steps: [baseStep],
      });
      if (parsed.isolation === "none") throw new Error("expected config");
      equal(parsed.isolation.baseRef, ref);
    }
  });

  it("rejects malformed baseRef (leading/trailing slash, empty)", () => {
    for (const bad of ["/main", "origin/", ""]) {
      throws(
        () =>
          WorkflowDef.parse({
            description: "d",
            isolation: { baseRef: bad },
            steps: [baseStep],
          }),
        /baseRef|String must contain/,
      );
    }
  });

  it("rejects sharedPaths containing traversal, absolute, or .git inside isolation", () => {
    for (const bad of ["../escape", "/abs", ".git", ".git/config", "subdir/../up"]) {
      throws(
        () =>
          WorkflowDef.parse({
            description: "d",
            isolation: { sharedPaths: [bad] },
            steps: [baseStep],
          }),
        /sharedPaths/,
      );
    }
  });

  it("rejects empty worktreeSetup array inside isolation", () => {
    throws(
      () =>
        WorkflowDef.parse({
          description: "d",
          isolation: { worktreeSetup: [] },
          steps: [baseStep],
        }),
      /worktreeSetup/,
    );
  });

  it("rejects unknown isolation primitive values", () => {
    throws(() =>
      WorkflowDef.parse({
        description: "d",
        isolation: "container" as any,
        steps: [baseStep],
      }),
    );
  });
});
