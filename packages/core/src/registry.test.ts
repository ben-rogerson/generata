import { ok, strictEqual, rejects, throws } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, resolveAgentName } from "./registry.js";

const DEFINE_PATH = fileURLToPath(new URL("./define.ts", import.meta.url));

function writeAgent(file: string, name: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { defineAgent } from ${JSON.stringify(DEFINE_PATH)};
export default defineAgent({
  name: ${JSON.stringify(name)},
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
    writeAgent(join(root, "agents/echo.ts"), "echo-old-name");
    writeAgent(join(root, "agents/core/plan-dreamer.ts"), "plan-dreamer");
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

  it("derived name overrides the value supplied to defineAgent", async () => {
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
      writeAgent(join(root, "agents/Bad.ts"), "bad");
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
    throws(
      () => resolveAgentName("foo", ["a/foo", "b/foo"]),
      /Ambiguous 'foo'.*a\/foo.*b\/foo/,
    );
  });

  it("throws on no match", () => {
    throws(() => resolveAgentName("missing", candidates), /not found/);
  });
});

function writeWorkflow(file: string, name: string, agentRel: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { defineWorkflow } from ${JSON.stringify(DEFINE_PATH)};
import agent from "${agentRel}";
export default defineWorkflow({
  name: ${JSON.stringify(name)},
  description: "test",
  steps: [{ id: "s", agent }],
});
`,
  );
}

describe("loadRegistry workflows", () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "registry-wf-"));
    writeAgent(join(root, "agents/echo.ts"), "echo");
    writeWorkflow(join(root, "agents/standup/flow.ts"), "flow", "../echo.js");
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
});
