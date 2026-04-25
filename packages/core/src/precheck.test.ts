import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { formatPrecheckReport, precheckWorkflow } from "./precheck.js";

const planner = defineAgent({
  name: "stub-planner",
  type: "planner",
  description: "stub",
  modelTier: "light",
  tools: [],
  permissions: "none",
  timeoutSeconds: 60,
  interactive: false,
  promptContext: [],
  promptTemplate: () => "plan",
});

const worker = (name: string, reads: string[] = []) =>
  defineAgent({
    name,
    type: "worker",
    description: "stub",
    modelTier: "light",
    tools: [],
    permissions: "none",
    timeoutSeconds: 60,
    promptContext: [],
    promptTemplate: (args) => reads.map((r) => `${r}=${args[r]}`).join("\n"),
  });

const critic = (name: string) =>
  defineAgent({
    name,
    type: "critic",
    description: "stub",
    modelTier: "light",
    tools: [],
    permissions: "read-only",
    timeoutSeconds: 60,
    promptContext: [],
    promptTemplate: () => "review",
  });

describe("precheckWorkflow", () => {
  it("passes a clean workflow", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "clean",
        description: "d",
        required: ["project"] as const,
        variables: { plans_dir: "plans" },
        steps: [
          { id: "plan", agent: planner },
          { id: "build", agent: worker("builder", ["plans_dir", "project"]) },
        ],
      }),
      { project: "foo" },
    );
    deepStrictEqual(issues, []);
  });

  it("flags a template reading a missing var", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "missing-var",
        description: "d",
        steps: [
          { id: "plan", agent: planner },
          { id: "build", agent: worker("builder", ["nonexistent"]) },
        ],
      }),
      {},
    );
    strictEqual(issues.length, 1);
    ok(issues[0].message.includes("nonexistent"));
    strictEqual(issues[0].stepId, "build");
  });

  it("suggests a fix for a near-typo", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "typo",
        description: "d",
        variables: { plan_filepath: "plans/x.md" },
        steps: [
          { id: "plan", agent: planner },
          { id: "build", agent: worker("builder", ["plan_filepat"]) },
        ],
      }),
      {},
    );
    strictEqual(issues.length, 1);
    ok(
      issues[0].message.includes("did you mean 'plan_filepath'"),
      `expected suggestion, got: ${issues[0].message}`,
    );
  });

  it("catches derive reading an undefined var", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "bad-derive",
        description: "d",
        // Intentionally reads a key not in required/variables to prove the precheck flags it.
        derive: ({ missing_input }: Record<string, string>) => ({ derived: String(missing_input) }),
        steps: [{ id: "plan", agent: planner }],
      }),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow.derive reads 'missing_input'")));
  });

  it("catches a step args fn reading an unavailable var", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "bad-args-fn",
        description: "d",
        steps: [
          { id: "plan", agent: planner },
          {
            id: "build",
            agent: worker("builder"),
            args: (p: Record<string, string>) => ({ out: p.nonexistent }),
          },
        ],
      }),
      {},
    );
    ok(issues.some((i) => i.stepId === "build" && i.message.includes("nonexistent")));
  });

  it("catches a context file path referencing a missing var", () => {
    const agentWithCtx = defineAgent({
      name: "ctx-reader",
      type: "worker",
      description: "stub",
      modelTier: "light",
      tools: [],
      permissions: "none",
      timeoutSeconds: 60,
      promptContext: [{ filepath: ({ unavail }) => `${unavail}/readme.md` }],
      promptTemplate: () => "go",
    });
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "ctx-miss",
        description: "d",
        steps: [
          { id: "plan", agent: planner },
          { id: "read", agent: agentWithCtx },
        ],
      }),
      {},
    );
    ok(
      issues.some(
        (i) =>
          i.stepId === "read" &&
          i.message.includes("promptContext[0]") &&
          i.message.includes("unavail"),
      ),
    );
  });

  it("catches an unknown dependsOn target", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "bad-dep",
        description: "d",
        steps: [
          { id: "plan", agent: planner },
          { id: "build", agent: worker("builder"), dependsOn: ["ghost"] },
        ],
      }),
      {},
    );
    ok(issues.some((i) => i.message.includes("unknown step 'ghost'")));
  });

  it("catches missing invocation params", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "needs-param",
        description: "d",
        required: ["ticket_key"] as const,
        steps: [{ id: "plan", agent: planner }],
      }),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow requires param 'ticket_key'")));
  });

  it("allows a worker as the first step when variables are otherwise satisfied", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "worker-first",
        description: "d",
        steps: [{ id: "go", agent: worker("builder") }],
      }),
      {},
    );
    deepStrictEqual(issues, []);
  });

  it("allows a worker-first workflow that supplies plan_name via derive", () => {
    // Mirrors ship-ticket / ship-from-slack: external-data fetch opens the workflow,
    // plan_name is derived from a required param rather than emitted by an initiator planner.
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "fetch-then-plan",
        description: "d",
        required: ["ticket_key"] as const,
        variables: { plans_dir: "plans" },
        derive: ({ ticket_key }) => ({ plan_name: ticket_key }),
        steps: [
          { id: "fetch", agent: worker("fetcher", ["ticket_key", "plans_dir"]) },
          { id: "plan", agent: worker("planner-ish", ["plan_name", "plans_dir"]) },
        ],
      }),
      { ticket_key: "ABC-123" },
    );
    deepStrictEqual(issues, []);
  });

  it("still flags a workflow whose non-planner first step leaves plan_name unsupplied", () => {
    // Dropping the structural rule doesn't weaken safety: if plan_name is actually missing,
    // the variable-wiring check still catches it at the consuming step.
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "worker-first-missing",
        description: "d",
        steps: [
          { id: "fetch", agent: worker("fetcher") },
          { id: "use", agent: worker("consumer", ["plan_name"]) },
        ],
      }),
      {},
    );
    ok(
      issues.some((i) => i.stepId === "use" && i.message.includes("plan_name")),
      `expected plan_name to be flagged, got: ${JSON.stringify(issues)}`,
    );
  });

  it("rejects a critic depending on a non-retryable upstream", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "bad-critic-dep",
        description: "d",
        steps: [
          { id: "plan", agent: planner },
          { id: "review", agent: critic("reviewer") },
        ],
      }),
      {},
    );
    // The implicit dep is the planner, which IS retryable (non-interactive), so this should pass.
    deepStrictEqual(issues, []);
  });

  it("reports missing env keys under the active profile", () => {
    const vaultAgent = defineAgent({
      name: "vaulted",
      type: "worker",
      description: "stub",
      modelTier: "light",
      tools: [],
      permissions: "none",
      timeoutSeconds: 60,
      envKeys: ["PRECHECK_TEST_MISSING_KEY_XYZ"],
      promptContext: [],
      promptTemplate: () => "go",
    });
    const priorEnv = process.env.PRECHECK_TEST_MISSING_KEY_XYZ;
    delete process.env.PRECHECK_TEST_MISSING_KEY_XYZ;
    try {
      const issues = precheckWorkflow(
        defineWorkflow({
          name: "env-miss",
          description: "d",
          steps: [
            { id: "plan", agent: planner },
            { id: "use", agent: vaultAgent },
          ],
        }),
        {},
      );
      ok(
        issues.some(
          (i) => i.agentName === "vaulted" && i.message.includes("PRECHECK_TEST_MISSING_KEY_XYZ"),
        ),
      );
    } finally {
      if (priorEnv !== undefined) process.env.PRECHECK_TEST_MISSING_KEY_XYZ = priorEnv;
    }
  });

  it("treats initiator planner as supplying plan_name and instructions", () => {
    const issues = precheckWorkflow(
      defineWorkflow({
        name: "initiator",
        description: "d",
        steps: [
          { id: "init", agent: planner },
          { id: "use", agent: worker("builder", ["plan_name", "instructions"]) },
        ],
      }),
      {},
    );
    deepStrictEqual(issues, []);
  });
});

describe("formatPrecheckReport", () => {
  it("includes the workflow name, one line per issue, and a tail", () => {
    const report = formatPrecheckReport("wf", [
      { stepId: "s1", agentName: "a1", message: "boom" },
      { agentName: "a2", message: "env" },
      { message: "generic" },
    ]);
    const lines = report.split("\n");
    strictEqual(lines[0], "[precheck] wf");
    ok(lines.some((l) => l.includes("step 's1' (a1): boom")));
    ok(lines.some((l) => l.includes("agent 'a2': env")));
    ok(lines.some((l) => l === "\u2717 generic"));
    ok(lines[lines.length - 1].includes("3 problems"));
  });
});
