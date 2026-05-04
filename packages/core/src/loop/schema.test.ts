import { describe, it } from "node:test";
import { equal, ok, throws } from "node:assert/strict";
import { LoopWorkflowStep, WorkflowStep } from "../schema.js";

const minimalSubWorkflow = {
  kind: "workflow",
  name: "sub",
  description: "x",
  required: ["file"],
  variables: {},
  isolation: "none",
  steps: [{ id: "noop", agent: { type: "worker", name: "n", kind: "agent" } }],
} as never;

describe("LoopWorkflowStep", () => {
  it("accepts a minimal config with glob source and as", () => {
    const parsed = LoopWorkflowStep.parse({
      id: "reviews",
      subWorkflow: minimalSubWorkflow,
      each: { glob: "notes/*.md" },
      as: "file",
    });
    equal(parsed.id, "reviews");
    equal(parsed.concurrency, 1);
    equal(parsed.onFailure, "halt");
  });

  it("accepts json source without as", () => {
    const parsed = LoopWorkflowStep.parse({
      id: "drafts",
      subWorkflow: minimalSubWorkflow,
      each: { json: "tasks.json" },
    });
    ok(!("as" in parsed) || parsed.as === undefined);
  });

  it("rejects missing each", () => {
    throws(() =>
      LoopWorkflowStep.parse({
        id: "x",
        subWorkflow: minimalSubWorkflow,
      }),
    );
  });

  it("rejects concurrency: 0", () => {
    throws(() =>
      LoopWorkflowStep.parse({
        id: "x",
        subWorkflow: minimalSubWorkflow,
        each: { glob: "*.md" },
        as: "f",
        concurrency: 0,
      }),
    );
  });

  it("rejects glob source without as: at parse time", () => {
    throws(() =>
      LoopWorkflowStep.parse({
        id: "x",
        subWorkflow: minimalSubWorkflow,
        each: { glob: "*.md" },
      }),
    );
  });

  it("rejects empty as: (min(1) constraint)", () => {
    throws(() =>
      LoopWorkflowStep.parse({
        id: "x",
        subWorkflow: minimalSubWorkflow,
        each: { glob: "*.md" },
        as: "",
      }),
    );
  });

  it("accepts onFailure: continue", () => {
    const parsed = LoopWorkflowStep.parse({
      id: "x",
      subWorkflow: minimalSubWorkflow,
      each: { glob: "*.md" },
      as: "f",
      onFailure: "continue",
    });
    equal(parsed.onFailure, "continue");
  });

  it("rejects subWorkflow with kind: agent (must be a workflow)", () => {
    throws(() =>
      LoopWorkflowStep.parse({
        id: "x",
        subWorkflow: { kind: "agent", name: "n", type: "worker" } as never,
        each: { glob: "*.md" },
        as: "f",
      }),
    );
  });
});

describe("WorkflowStep union", () => {
  it("accepts a LoopWorkflowStep value", () => {
    const parsed = WorkflowStep.parse({
      id: "reviews",
      subWorkflow: minimalSubWorkflow,
      each: { glob: "*.md" },
      as: "file",
    });
    equal(parsed.id, "reviews");
  });
});
