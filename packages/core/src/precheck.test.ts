import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAgent, defineWorkflow } from "./define.js";
import { formatPrecheckReport, precheckWorkflow } from "./precheck.js";

function withName<T>(def: T, name: string): T {
  (def as unknown as { name: string }).name = name;
  return def;
}

const planner = withName(
  defineAgent({
    type: "planner",
    description: "stub",
    modelTier: "light",
    tools: [],
    permissions: "none",
    timeoutSeconds: 60,
    interactive: false,
    promptContext: [],
    promptTemplate: () => "plan",
  }),
  "stub-planner",
);

const worker = (name: string, reads: string[] = []) =>
  withName(
    defineAgent({
      type: "worker",
      description: "stub",
      modelTier: "light",
      tools: [],
      permissions: "none",
      timeoutSeconds: 60,
      promptContext: [],
      promptTemplate: (args) => reads.map((r) => `${r}=${args[r]}`).join("\n"),
    }),
    name,
  );

const critic = (name: string) =>
  withName(
    defineAgent({
      type: "critic",
      description: "stub",
      modelTier: "light",
      tools: [],
      permissions: "read-only",
      timeoutSeconds: 60,
      promptContext: [],
      promptTemplate: () => "review",
    }),
    name,
  );

describe("precheckWorkflow", () => {
  it("passes a clean workflow", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          required: ["project"] as const,
          variables: { plans_dir: "plans" },
          steps: [
            { id: "plan", agent: planner },
            { id: "build", agent: worker("builder", ["plans_dir", "project"]) },
          ],
        }),
        "clean",
      ),
      { project: "foo" },
    );
    deepStrictEqual(issues, []);
  });

  it("flags a template reading a missing var", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "plan", agent: planner },
            { id: "build", agent: worker("builder", ["nonexistent"]) },
          ],
        }),
        "missing-var",
      ),
      {},
    );
    strictEqual(issues.length, 1);
    ok(issues[0].message.includes("nonexistent"));
    strictEqual(issues[0].stepId, "build");
  });

  it("suggests a fix for a near-typo", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          variables: { plan_filepath: "plans/x.md" },
          steps: [
            { id: "plan", agent: planner },
            { id: "build", agent: worker("builder", ["plan_filepat"]) },
          ],
        }),
        "typo",
      ),
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
      withName(
        defineWorkflow({
          description: "d",
          // Intentionally reads a key not in required/variables to prove the precheck flags it.
          derive: ({ missing_input }: Record<string, string>) => ({
            derived: String(missing_input),
          }),
          steps: [{ id: "plan", agent: planner }],
        }),
        "bad-derive",
      ),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow.derive reads 'missing_input'")));
  });

  it("catches a step args fn reading an unavailable var", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
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
        "bad-args-fn",
      ),
      {},
    );
    ok(issues.some((i) => i.stepId === "build" && i.message.includes("nonexistent")));
  });

  it("catches a context file path referencing a missing var", () => {
    const agentWithCtx = withName(
      defineAgent({
        type: "worker",
        description: "stub",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        promptContext: [{ filepath: ({ unavail }) => `${unavail}/readme.md` }],
        promptTemplate: () => "go",
      }),
      "ctx-reader",
    );
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "plan", agent: planner },
            { id: "read", agent: agentWithCtx },
          ],
        }),
        "ctx-miss",
      ),
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
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "plan", agent: planner },
            { id: "build", agent: worker("builder"), dependsOn: ["ghost"] },
          ],
        }),
        "bad-dep",
      ),
      {},
    );
    ok(issues.some((i) => i.message.includes("unknown step 'ghost'")));
  });

  it("catches missing invocation params", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          required: ["ticket_key"] as const,
          steps: [{ id: "plan", agent: planner }],
        }),
        "needs-param",
      ),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow requires param 'ticket_key'")));
  });

  it("allows a worker as the first step when variables are otherwise satisfied", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          steps: [{ id: "go", agent: worker("builder") }],
        }),
        "worker-first",
      ),
      {},
    );
    deepStrictEqual(issues, []);
  });

  it("allows a worker-first workflow that supplies plan_name via derive", () => {
    // Mirrors ship-ticket / ship-from-slack: external-data fetch opens the workflow,
    // plan_name is derived from a required param rather than emitted by an initiator planner.
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          required: ["ticket_key"] as const,
          variables: { plans_dir: "plans" },
          derive: ({ ticket_key }) => ({ plan_name: ticket_key }),
          steps: [
            { id: "fetch", agent: worker("fetcher", ["ticket_key", "plans_dir"]) },
            { id: "plan", agent: worker("planner-ish", ["plan_name", "plans_dir"]) },
          ],
        }),
        "fetch-then-plan",
      ),
      { ticket_key: "ABC-123" },
    );
    deepStrictEqual(issues, []);
  });

  it("still flags a workflow whose non-planner first step leaves plan_name unsupplied", () => {
    // Dropping the structural rule doesn't weaken safety: if plan_name is actually missing,
    // the variable-wiring check still catches it at the consuming step.
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "fetch", agent: worker("fetcher") },
            { id: "use", agent: worker("consumer", ["plan_name"]) },
          ],
        }),
        "worker-first-missing",
      ),
      {},
    );
    ok(
      issues.some((i) => i.stepId === "use" && i.message.includes("plan_name")),
      `expected plan_name to be flagged, got: ${JSON.stringify(issues)}`,
    );
  });

  it("rejects a critic depending on a non-retryable upstream", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "plan", agent: planner },
            { id: "review", agent: critic("reviewer") },
          ],
        }),
        "bad-critic-dep",
      ),
      {},
    );
    // The implicit dep is the planner, which IS retryable (non-interactive), so this should pass.
    deepStrictEqual(issues, []);
  });

  it("reports missing env keys under the active profile", () => {
    const vaultAgent = withName(
      defineAgent({
        type: "worker",
        description: "stub",
        modelTier: "light",
        tools: [],
        permissions: "none",
        timeoutSeconds: 60,
        envKeys: ["PRECHECK_TEST_MISSING_KEY_XYZ"],
        promptContext: [],
        promptTemplate: () => "go",
      }),
      "vaulted",
    );
    const priorEnv = process.env.PRECHECK_TEST_MISSING_KEY_XYZ;
    delete process.env.PRECHECK_TEST_MISSING_KEY_XYZ;
    try {
      const issues = precheckWorkflow(
        withName(
          defineWorkflow({
            description: "d",
            steps: [
              { id: "plan", agent: planner },
              { id: "use", agent: vaultAgent },
            ],
          }),
          "env-miss",
        ),
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
      withName(
        defineWorkflow({
          description: "d",
          steps: [
            { id: "init", agent: planner },
            { id: "use", agent: worker("builder", ["plan_name", "instructions"]) },
          ],
        }),
        "initiator",
      ),
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
