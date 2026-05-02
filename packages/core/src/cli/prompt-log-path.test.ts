import { equal } from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPromptLogPath } from "./prompt-log-path.js";

describe("buildPromptLogPath", () => {
  it("nests by kind under logsDir", () => {
    const out = buildPromptLogPath("/work", "logs", "workflow", "ship", "20250102T030405Z");
    equal(out, "/work/logs/workflow/ship-20250102T030405Z.log");
  });

  it("uses an agent/ subdir for agent runs", () => {
    const out = buildPromptLogPath("/work", "logs", "agent", "writer", "20250102T030405Z");
    equal(out, "/work/logs/agent/writer-20250102T030405Z.log");
  });

  it("uses just the basename of nested path-derived names", () => {
    const out = buildPromptLogPath(
      "/work",
      "logs",
      "workflow",
      "workflows/foo",
      "20250102T030405Z",
    );
    equal(out, "/work/logs/workflow/foo-20250102T030405Z.log");
  });

  it("uses basename for deeply nested names too", () => {
    const out = buildPromptLogPath(
      "/work",
      "logs",
      "agent",
      "workers/feature/writer",
      "20250102T030405Z",
    );
    equal(out, "/work/logs/agent/writer-20250102T030405Z.log");
  });

  it("respects a custom logsDir", () => {
    const out = buildPromptLogPath("/work", "prompts", "workflow", "ship", "20250102T030405Z");
    equal(out, "/work/prompts/workflow/ship-20250102T030405Z.log");
  });

  it("falls back to the full hyphenated name when a sibling shares the basename", () => {
    const out = buildPromptLogPath(
      "/work",
      "logs",
      "workflow",
      "workflows/improve",
      "20250102T030405Z",
      ["workflows/improve", "experimental/improve"],
    );
    equal(out, "/work/logs/workflow/workflows-improve-20250102T030405Z.log");
  });

  it("keeps the basename when siblings list is unique", () => {
    const out = buildPromptLogPath(
      "/work",
      "logs",
      "workflow",
      "workflows/improve",
      "20250102T030405Z",
      ["workflows/improve", "workflows/ship"],
    );
    equal(out, "/work/logs/workflow/improve-20250102T030405Z.log");
  });
});
