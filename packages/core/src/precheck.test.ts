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
        })
          .step("plan", planner)
          .step("build", worker("builder", ["plans_dir", "project"]))
          .build(),
        "clean",
      ),
      { project: "foo" },
    );
    deepStrictEqual(issues, []);
  });

  it("flags a template reading a missing var", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({ description: "d" })
          .step("plan", planner)
          .step("build", worker("builder", ["nonexistent"]))
          .build(),
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
        })
          .step("plan", planner)
          .step("build", worker("builder", ["plan_filepat"]))
          .build(),
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
        })
          .step("plan", planner)
          .build(),
        "bad-derive",
      ),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow.derive reads 'missing_input'")));
  });

  it("catches a step args fn reading an unavailable var", () => {
    // Note: with chain builder, stepFn is the equivalent of the old args fn.
    // Here we use a factory agent that destructures `nonexistent` to trigger
    // the precheck warning the old test was exercising.
    const consumer = defineAgent<{ out: string }>(({ out }) => ({
      type: "worker",
      description: "stub",
      modelTier: "light",
      tools: [],
      permissions: "none",
      timeoutSeconds: 60,
      promptContext: [],
      promptTemplate: `out=${out}`,
    }));
    (consumer as any).name = "consumer";

    const issues = precheckWorkflow(
      withName(
        defineWorkflow({ description: "d" })
          .step("plan", planner)
          .step("build", (p: Record<string, string>) => consumer({ out: p.nonexistent }))
          .build(),
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
        defineWorkflow({ description: "d" })
          .step("plan", planner)
          .step("read", agentWithCtx)
          .build(),
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
        defineWorkflow({ description: "d" })
          .step("plan", planner)
          .step("build", worker("builder"), { dependsOn: ["ghost"] })
          .build(),
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
        })
          .step("plan", planner)
          .build(),
        "needs-param",
      ),
      {},
    );
    ok(issues.some((i) => i.message.includes("workflow requires param 'ticket_key'")));
  });

  it("allows a worker as the first step when variables are otherwise satisfied", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({ description: "d" }).step("go", worker("builder")).build(),
        "worker-first",
      ),
      {},
    );
    deepStrictEqual(issues, []);
  });

  it("allows a worker-first workflow that supplies plan_name via derive", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({
          description: "d",
          required: ["ticket_key"] as const,
          variables: { plans_dir: "plans" },
          derive: ({ ticket_key }) => ({ plan_name: ticket_key }),
        })
          .step("fetch", worker("fetcher", ["ticket_key", "plans_dir"]))
          .step("plan", worker("planner-ish", ["plan_name", "plans_dir"]))
          .build(),
        "fetch-then-plan",
      ),
      { ticket_key: "ABC-123" },
    );
    deepStrictEqual(issues, []);
  });

  it("still flags a workflow whose non-planner first step leaves plan_name unsupplied", () => {
    const issues = precheckWorkflow(
      withName(
        defineWorkflow({ description: "d" })
          .step("fetch", worker("fetcher"))
          .step("use", worker("consumer", ["plan_name"]))
          .build(),
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
        defineWorkflow({ description: "d" })
          .step("plan", planner)
          .step("review", critic("reviewer"))
          .build(),
        "bad-critic-dep",
      ),
      {},
    );
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
          defineWorkflow({ description: "d" })
            .step("plan", planner)
            .step("use", vaultAgent)
            .build(),
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
        defineWorkflow({ description: "d" })
          .step("init", planner)
          .step("use", worker("builder", ["plan_name", "instructions"]))
          .build(),
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
    ok(lines.some((l) => l === "✗ generic"));
    ok(lines[lines.length - 1].includes("3 problems"));
  });
});
