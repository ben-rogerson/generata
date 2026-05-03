import { ok, strictEqual, rejects, throws } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, resolveAgentName } from "./registry.js";

const DEFINE_PATH = fileURLToPath(new URL("./define.ts", import.meta.url));

function writeAgent(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { defineAgent } from ${JSON.stringify(DEFINE_PATH)};
export default defineAgent({
  type: "worker",
  description: "test",
  modelTier: "light",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 10,
  promptTemplate: () => "noop",
});
`,
  );
}

describe("loadRegistry", () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "registry-test-"));
    writeAgent(join(root, "agents/echo.ts"));
    writeAgent(join(root, "agents/core/plan-dreamer.ts"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("derives canonical name from path relative to agentsDir", async () => {
    const registry = await loadRegistry({
      projectRoot: root,
      agentsDir: "agents",
    });
    ok(registry.has("echo"));
    ok(registry.has("core/plan-dreamer"));
  });

  it("stamps the derived name onto the loaded def", async () => {
    const registry = await loadRegistry({
      projectRoot: root,
      agentsDir: "agents",
    });
    strictEqual(registry.get("echo").name, "echo");
  });

  it("stamps kind: 'agent' on each loaded def", async () => {
    const registry = await loadRegistry({
      projectRoot: root,
      agentsDir: "agents",
    });
    const echo = registry.get("echo") as unknown as { kind: string };
    strictEqual(echo.kind, "agent");
  });
});

describe("loadRegistry path validation", () => {
  it("throws on an invalid filename segment", async () => {
    const root = mkdtempSync(join(tmpdir(), "registry-bad-"));
    try {
      writeAgent(join(root, "agents/Bad.ts"));
      await rejects(
        loadRegistry({
          projectRoot: root,
          agentsDir: "agents",
        }),
        /invalid path segment 'Bad'/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips files and directories prefixed with underscore", async () => {
    const root = mkdtempSync(join(tmpdir(), "registry-skip-"));
    try {
      writeAgent(join(root, "agents/echo.ts"));
      writeFileSync(join(root, "agents/_shared.ts"), "export const X = 1;\n");
      mkdirSync(join(root, "agents/_internal"), { recursive: true });
      writeFileSync(join(root, "agents/_internal/util.ts"), "export const Y = 2;\n");
      const registry = await loadRegistry({ projectRoot: root, agentsDir: "agents" });
      ok(registry.has("echo"));
      strictEqual(registry.list().length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resolveAgentName", () => {
  const candidates = ["echo", "core/plan-dreamer", "utilities/plan-remover"];

  it("returns the input when it matches a canonical name exactly", () => {
    strictEqual(resolveAgentName("echo", candidates), "echo");
    strictEqual(resolveAgentName("core/plan-dreamer", candidates), "core/plan-dreamer");
  });

  it("resolves an unambiguous basename", () => {
    strictEqual(resolveAgentName("plan-dreamer", candidates), "core/plan-dreamer");
  });

  it("throws on an ambiguous basename", () => {
    throws(() => resolveAgentName("foo", ["a/foo", "b/foo"]), /Ambiguous 'foo'.*a\/foo.*b\/foo/);
  });

  it("throws on no match", () => {
    throws(() => resolveAgentName("missing", candidates), /not found/);
  });
});

function writeWorkflow(file: string, agentRel: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { defineWorkflow } from ${JSON.stringify(DEFINE_PATH)};
import agent from "${agentRel}";
export default defineWorkflow({ description: "test" }).step("s", agent).build();
`,
  );
}

describe("loadSingleAgentRegistry basename resolution", () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "registry-single-"));
    writeAgent(join(root, "agents/core/plan-dreamer.ts"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("loads a nested agent by its basename", async () => {
    const { loadSingleAgentRegistry } = await import("./registry.js");
    const registry = await loadSingleAgentRegistry("plan-dreamer", {
      projectRoot: root,
      agentsDir: "agents",
    });
    const [agent] = registry.list();
    strictEqual(agent.name, "core/plan-dreamer");
  });
});

describe("loadRegistry workflows", () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "registry-wf-"));
    writeAgent(join(root, "agents/echo.ts"));
    writeWorkflow(join(root, "agents/standup/flow.ts"), "../echo.js");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("discovers workflows anywhere under agentsDir", async () => {
    const registry = await loadRegistry({ projectRoot: root, agentsDir: "agents" });
    ok(registry.workflows.has("standup/flow"));
  });

  it("routes by kind: agents go to agents map, workflows go to workflows map", async () => {
    const registry = await loadRegistry({ projectRoot: root, agentsDir: "agents" });
    ok(registry.agents.has("echo"));
    ok(!registry.workflows.has("echo"));
    ok(registry.workflows.has("standup/flow"));
    ok(!registry.agents.has("standup/flow"));
  });

  it("workflow steps reference the same agent objects as the agents map", async () => {
    const registry = await loadRegistry({ projectRoot: root, agentsDir: "agents" });
    const wf = registry.getWorkflow("standup/flow");
    const step = wf.steps[0];
    const stepAgent = ("agent" in step ? step.agent : undefined) as { name?: string } | undefined;
    const directAgent = registry.get("echo");
    strictEqual(stepAgent?.name, "echo");
    strictEqual(stepAgent === directAgent, true);
  });
});
