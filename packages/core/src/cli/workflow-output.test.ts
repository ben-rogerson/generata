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

  it("returns the final step's output when non-empty", () => {
    const steps = [
      {
        stepId: "only",
        output: "hello world",
        metrics: { agent: "x" } as any,
      },
    ];
    strictEqual(pickPrintableFinalOutput(steps, emptyWorkflow), "hello world");
  });

  it("returns null when the final step's output is empty", () => {
    const steps = [
      {
        stepId: "only",
        output: "",
        metrics: { agent: "x" } as any,
      },
    ];
    strictEqual(pickPrintableFinalOutput(steps, emptyWorkflow), null);
  });

  it("returns null when the final step's output is whitespace only", () => {
    const steps = [
      {
        stepId: "only",
        output: "   \n\t  ",
        metrics: { agent: "x" } as any,
      },
    ];
    strictEqual(pickPrintableFinalOutput(steps, emptyWorkflow), null);
  });

  it("trims surrounding whitespace from the output", () => {
    const steps = [
      {
        stepId: "only",
        output: "\n\n  a haiku  \n",
        metrics: { agent: "x" } as any,
      },
    ];
    strictEqual(pickPrintableFinalOutput(steps, emptyWorkflow), "a haiku");
  });

  it("returns null when the final step's output is the interactive placeholder", () => {
    const steps = [
      {
        stepId: "only",
        output: "[interactive session completed]",
        metrics: { agent: "x" } as any,
      },
    ];
    strictEqual(pickPrintableFinalOutput(steps, emptyWorkflow), null);
  });
});
