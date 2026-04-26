import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { pickPrintableFinalOutput } from "./workflow-output.js";
import type { WorkflowDef } from "../schema.js";

const emptyWorkflow = {
  description: "x",
  required: [],
  variables: {},
  steps: [],
  kind: "workflow" as const,
  name: "test",
} as unknown as WorkflowDef;

describe("pickPrintableFinalOutput", () => {
  it("returns null when no steps ran", () => {
    strictEqual(pickPrintableFinalOutput([], emptyWorkflow), null);
  });
});
