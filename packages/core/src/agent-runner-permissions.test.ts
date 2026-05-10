import { equal, ok, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAllowedTools, buildEmissionPrompt } from "./agent-runner.js";
import { defineAgent } from "./define.js";
import type { AgentDef } from "./schema.js";

const EMIT_BIN = "/abs/path/bin/emit";
const EMIT_FILE = "/tmp/outputs-foo.json";
const VERDICT_BIN = "/abs/path/bin/verdict";

function asLLM<T>(def: T): AgentDef {
  (def as unknown as { name: string }).name = "test";
  return def as unknown as AgentDef;
}

describe("buildAllowedTools", () => {
  it("read-only agent with outputs grants Write(EMIT_FILE), never Bash on the emit bin", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "scanner",
        modelTier: "light",
        permissions: "read-only",
        tools: [],
        timeoutSeconds: 60,
        outputs: { findings_json: "scan output" },
        prompt: "go",
      }),
    );

    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: EMIT_BIN,
      outputsFile: EMIT_FILE,
    });

    ok(allowed !== null, "read-only agents always get an --allowedTools value");
    const tools = allowed.split(",");
    ok(
      !tools.some((t) => t.startsWith("Bash(") && t.includes(EMIT_BIN)),
      `must not grant Bash on the emit bin; got: ${allowed}`,
    );
    // The `//` prefix is the documented absolute-path syntax in Claude Code's
    // permission rules; a single `/` would be project-root-relative and miss
    // the actual tmpdir path the agent writes to.
    ok(
      tools.includes(`Edit(/${EMIT_FILE})`),
      `must grant scoped Edit to EMIT_FILE with absolute-path syntax; got: ${allowed}`,
    );
    // Bare Edit/Write (no path scope) would re-open the file-creation hole the fix closes.
    ok(!tools.includes("Edit"), `must not grant unscoped Edit; got: ${allowed}`);
    ok(!tools.includes("Write"), `must not grant unscoped Write; got: ${allowed}`);
    ok(tools.includes("Read"), "read-only baseline still includes Read");
  });

  it("read-only critic keeps Bash on the verdict bin (out of scope for this fix)", () => {
    const agent = asLLM(
      defineAgent({
        type: "critic",
        description: "reviewer",
        modelTier: "light",
        tools: [],
        timeoutSeconds: 60,
        prompt: "review",
      }),
    );

    const allowed = buildAllowedTools(agent, {
      verdictBin: VERDICT_BIN,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });

    ok(allowed !== null);
    ok(
      allowed.split(",").includes(`Bash(${VERDICT_BIN}:*)`),
      `critics still need verdict bin Bash perm; got: ${allowed}`,
    );
  });

  it("full-permission worker with outputs uses Bash on the emit bin (existing behaviour)", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "writer",
        modelTier: "light",
        permissions: "full",
        tools: [],
        timeoutSeconds: 60,
        outputs: { diff_filepath: "patch path" },
        prompt: "write",
      }),
    );

    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: EMIT_BIN,
      outputsFile: EMIT_FILE,
    });

    ok(allowed !== null);
    const tools = allowed.split(",");
    ok(
      tools.includes(`Bash(${EMIT_BIN}:*)`),
      `full-permission agents keep Bash bin path; got: ${allowed}`,
    );
    ok(
      !tools.some((t) => t.startsWith("Edit(") || t.startsWith("Write(")),
      `full-permission agents do not get scoped Edit/Write; got: ${allowed}`,
    );
  });

  it("full-permission worker with no tools and no bins returns null (no flag)", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "nothing",
        modelTier: "light",
        permissions: "full",
        tools: [],
        timeoutSeconds: 60,
        prompt: "x",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    equal(allowed, null);
  });

  it("full-permission worker with filesystemAccess: false omits Read/Glob/Grep base tools", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "fetcher",
        modelTier: "light",
        permissions: "full",
        tools: ["web-fetch"],
        filesystemAccess: false,
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    ok(!tools.includes("Read"), `must omit Read; got: ${allowed}`);
    ok(!tools.includes("Glob"), `must omit Glob; got: ${allowed}`);
    ok(!tools.includes("Grep"), `must omit Grep; got: ${allowed}`);
    ok(tools.includes("WebFetch"), `still grants declared tools; got: ${allowed}`);
  });

  it("full-permission worker with filesystemAccess: true keeps base tools (explicit opt-in)", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "writer",
        modelTier: "light",
        permissions: "full",
        tools: ["write"],
        filesystemAccess: true,
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    ok(tools.includes("Read"));
    ok(tools.includes("Glob"));
    ok(tools.includes("Grep"));
  });

  it("full-permission worker with filesystemAccess omitted keeps base tools (default behaviour)", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "writer",
        modelTier: "light",
        permissions: "full",
        tools: ["write"],
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    ok(tools.includes("Read"));
    ok(tools.includes("Glob"));
    ok(tools.includes("Grep"));
  });

  it("read-only worker with filesystemAccess: false fails Zod validation", () => {
    throws(
      () =>
        defineAgent({
          type: "worker",
          description: "scanner",
          modelTier: "light",
          permissions: "read-only",
          tools: [],
          filesystemAccess: false,
          timeoutSeconds: 60,
          prompt: "go",
        }),
      /filesystemAccess/,
    );
  });

  it("read-only agent declaring read/glob/grep produces no duplicate entries", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "scanner",
        modelTier: "light",
        permissions: "read-only",
        tools: ["read", "glob", "grep"],
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    equal(tools.length, new Set(tools).size, `must not contain duplicates; got: ${allowed}`);
  });

  it("full-permission agent declaring read/glob/grep with filesystem access produces no duplicates", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "reader",
        modelTier: "light",
        permissions: "full",
        tools: ["read", "glob", "grep"],
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    equal(tools.length, new Set(tools).size, `must not contain duplicates; got: ${allowed}`);
  });

  it("'read'/'glob'/'grep' Tool enum values resolve via TOOL_NAME_MAP for full agents", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "reader",
        modelTier: "light",
        permissions: "full",
        tools: ["read", "glob", "grep"],
        filesystemAccess: false,
        timeoutSeconds: 60,
        prompt: "go",
      }),
    );
    const allowed = buildAllowedTools(agent, {
      verdictBin: null,
      paramsBin: null,
      outputsBin: null,
      outputsFile: null,
    });
    ok(allowed !== null);
    const tools = allowed.split(",");
    ok(tools.includes("Read"));
    ok(tools.includes("Glob"));
    ok(tools.includes("Grep"));
  });
});

describe("buildEmissionPrompt", () => {
  it("read-only agent prompt instructs Write tool use and never references the emit bin", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "scanner",
        modelTier: "light",
        permissions: "read-only",
        tools: [],
        timeoutSeconds: 60,
        outputs: { findings_json: "scan output" },
        prompt: "go",
      }),
    );
    const prompt = buildEmissionPrompt(agent, EMIT_BIN, EMIT_FILE);
    ok(prompt.includes("Write tool"), "read-only prompt must mention the Write tool");
    ok(prompt.includes(EMIT_FILE), "read-only prompt must reference EMIT_FILE path");
    ok(!prompt.includes(EMIT_BIN), "read-only prompt must not reference the emit bin");
    ok(prompt.includes("findings_json"), "declared keys are listed");
    ok(
      prompt.includes('{"__halt": "<one-line reason>"}'),
      "halt path uses JSON object via Write tool",
    );
  });

  it("full-permission agent prompt still uses the emit bin command", () => {
    const agent = asLLM(
      defineAgent({
        type: "worker",
        description: "writer",
        modelTier: "light",
        permissions: "full",
        tools: [],
        timeoutSeconds: 60,
        outputs: { diff_filepath: "patch path" },
        prompt: "write",
      }),
    );
    const prompt = buildEmissionPrompt(agent, EMIT_BIN, EMIT_FILE);
    ok(prompt.includes(EMIT_BIN), "full-permission prompt references emit bin");
    ok(prompt.includes("--diff_filepath"), "flag form is rendered");
    ok(prompt.includes('--halt "<one-line reason>"'), "halt path uses --halt flag");
  });
});
