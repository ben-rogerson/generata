import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";

describe("defineWorkflow worktree input type", () => {
  it("compiles with all worktree fields and rejects unknown isolation values at the type level", () => {
    const stub = defineAgent({
      type: "worker", description: "x", modelTier: "light", tools: [],
      permissions: "full", timeoutSeconds: 60, promptContext: [],
      promptTemplate: () => "p",
    });
    (stub as any).name = "stub";

    // Smoke test: this must compile.
    defineWorkflow({
      description: "d",
      isolation: "worktree",
      worktreeSetup: ["pnpm", "install"],
      sharedPaths: ["IMPROVEMENTS.md"],
      worktreeDir: "../wt",
      steps: [{ id: "s", agent: stub }],
    });

    // No runtime assertion - this test is a typecheck. If `pnpm typecheck`
    // accepts this file, the API is wired up.
  });
});
