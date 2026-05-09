import { describe, it, before, after } from "node:test";
import { ok } from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrompt } from "./context-builder.js";
import type { GlobalConfig, AgentDef } from "./schema.js";

const stubConfig: GlobalConfig = {
  modelTiers: { heavy: "h", standard: "s", light: "l" },
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

function makeAgent(promptContext: AgentDef["promptContext"]): AgentDef {
  const agent = {
    type: "worker" as const,
    name: "ctx-test",
    description: "d",
    modelTier: "light" as const,
    tools: [],
    permissions: "full" as const,
    timeoutSeconds: 60,
    envKeys: [],
    promptContext,
    prompt: () => "task",
    maxRetries: 1,
  };
  return agent as unknown as AgentDef;
}

describe("renderContextEntry head/tail slicing", () => {
  let tmp: string;
  const filename = "lines.txt";
  const fileLines = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"];

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "generata-ctx-"));
    writeFileSync(join(tmp, filename), fileLines.join("\n"));
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function extractContext(prompt: string): string {
    const match = prompt.match(/<context file="[^"]+">\n([\s\S]*?)\n<\/context>/);
    ok(match, "expected a <context> tag in prompt");
    return match[1];
  }

  it("includes the full file when neither head nor tail is set", () => {
    const agent = makeAgent([{ filepath: filename }]);
    const prompt = buildPrompt({ agent, args: {}, config: stubConfig, workDir: tmp });
    const body = extractContext(prompt);
    ok(body === fileLines.join("\n"), `expected full file, got: ${body}`);
  });

  it("takes the first N lines when head is set", () => {
    const agent = makeAgent([{ filepath: filename, head: 3 }]);
    const prompt = buildPrompt({ agent, args: {}, config: stubConfig, workDir: tmp });
    const body = extractContext(prompt);
    ok(body === "L1\nL2\nL3", `expected first 3 lines, got: ${body}`);
  });

  it("takes the last N lines when tail is set", () => {
    const agent = makeAgent([{ filepath: filename, tail: 2 }]);
    const prompt = buildPrompt({ agent, args: {}, config: stubConfig, workDir: tmp });
    const body = extractContext(prompt);
    ok(body === "L9\nL10", `expected last 2 lines, got: ${body}`);
  });

  it("applies head then tail when both are set (range primitive)", () => {
    // head: first 6 lines = L1..L6; then tail: last 2 of those = L5, L6
    const agent = makeAgent([{ filepath: filename, head: 6, tail: 2 }]);
    const prompt = buildPrompt({ agent, args: {}, config: stubConfig, workDir: tmp });
    const body = extractContext(prompt);
    ok(body === "L5\nL6", `expected L5..L6 from head=6 tail=2, got: ${body}`);
  });
});
