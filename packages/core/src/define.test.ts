import { describe, it } from "node:test";
import { equal, ok, throws } from "node:assert/strict";
import { defineAgent, defineWorkflow, worktree } from "./define.js";

describe("defineWorkflow chain builder", () => {
  const stub = defineAgent({
    type: "worker",
    description: "x",
    modelTier: "light",
    tools: [],
    permissions: "full",
    timeoutSeconds: 60,
    promptContext: [],
    prompt: () => "p",
  });
  (stub as any).name = "stub";

  it("compiles with isolation: worktree({...})", () => {
    defineWorkflow({
      description: "d",
      isolation: worktree({
        worktreeSetup: ["pnpm", "install"],
        sharedPaths: ["IMPROVEMENTS.md"],
        worktreeDir: "../wt",
      }),
    })
      .step("s", stub)
      .build();
  });

  it("step args see prior step ids and declared variables (builtins are not exposed)", () => {
    const factoryAgent = defineAgent<{ a: string; b: string; c: string }>(() => ({
      type: "worker",
      description: "f",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: "p",
    }));
    (factoryAgent as any).name = "factory";

    defineWorkflow({
      description: "d",
      variables: { focus: "" },
      required: ["topic"] as const,
    })
      .step("first", stub)
      .step("second", ({ first, focus, topic }) => factoryAgent({ a: first, b: focus, c: topic }))
      // @ts-expect-error - builtins (work_dir/today/time) are not in step fn params
      .step("third", ({ work_dir }) => factoryAgent({ a: work_dir, b: "", c: "" }))
      .build();
  });

  it("accepts a bare-agent shorthand for steps with no extra config", () => {
    defineWorkflow({ description: "d" }).step("first", stub).step("second", stub).build();
  });

  it("factory-form defineAgent: returns a callable, exposes static config + __inputs", () => {
    const specCreator = defineAgent<{ picker_output: string }>(({ picker_output, today }) => ({
      type: "worker",
      description: "spec",
      modelTier: "heavy",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: `${today}: ${picker_output}`,
    }));
    (specCreator as any).name = "spec";

    equal(specCreator.type, "worker");
    equal(specCreator.description, "spec");
    ok("picker_output" in specCreator.__inputs);

    const inv = specCreator({ picker_output: "an item" });
    equal(inv.kind, "step-invocation");
  });

  it("factory-form: builtins resolve through closure at engine time, not at call time", () => {
    // Regression: the factory used to be called with sentinel placeholders for
    // builtins when the user invoked the callable. The closure now defers
    // factory execution until the engine provides full args, so today/work_dir
    // reach the prompt as real values.
    const agent = defineAgent<{ x: string }>(({ x, today, work_dir }) => ({
      type: "worker",
      description: "t",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: `today=${today} dir=${work_dir} x=${x}`,
    }));
    (agent as any).name = "t";

    const inv = agent({ x: "real-x" });
    equal(typeof inv.agent.prompt, "function");

    const prompt = (inv.agent.prompt as (a: any) => string)({
      today: "2026-05-02",
      work_dir: "/repo",
      time: "12:00",
      x: "real-x",
    });
    ok(prompt.includes("today=2026-05-02"), `expected real today, got: ${prompt}`);
    ok(prompt.includes("dir=/repo"), `expected real work_dir, got: ${prompt}`);
    ok(prompt.includes("x=real-x"));
    ok(!prompt.includes("__placeholder_"), `prompt leaked sentinel: ${prompt}`);
  });

  it("rejects passing a factory-form agent bare to .step() (compile-time)", () => {
    const factoryAgent = defineAgent<{ x: string }>(({ x }) => ({
      type: "worker",
      description: "f",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: `x=${x}`,
    }));
    (factoryAgent as any).name = "fac";

    // Type-only assertion: the call below would throw at runtime (covered by
    // the next test), so guard it to keep this test about the type error only.
    if (false as boolean) {
      defineWorkflow({ description: "d" })
        // @ts-expect-error - factory agents must be called inside a step fn
        .step("first", factoryAgent);
    }
  });

  it("runtime guard throws when factory passed bare via type cast", () => {
    const factoryAgent = defineAgent<{ x: string }>(({ x }) => ({
      type: "worker",
      description: "f",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: `x=${x}`,
    }));
    (factoryAgent as any).name = "fac";

    let threw = false;
    try {
      defineWorkflow({ description: "d" }).step("oops", factoryAgent as any);
    } catch (e) {
      threw = true;
      ok(String(e).includes("factory-form agent"));
    }
    ok(threw, "expected step() to throw when handed a bare factory");
  });

  it("rejects unknown destructured params and forward-step ids", () => {
    const consumer = defineAgent<{ x: string }>(() => ({
      type: "worker",
      description: "c",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: "p",
    }));
    (consumer as any).name = "consumer";

    defineWorkflow({ description: "d" })
      .step("first", stub)
      // @ts-expect-error - 'nope' is not in prior ids, vars, required, or derived
      .step("second", ({ nope }) => consumer({ x: nope }))
      // @ts-expect-error - 'fourth' has not run before this step
      .step("third", ({ fourth }) => consumer({ x: fourth }))
      .build();
  });

  it("step options pass through (maxRetries, dependsOn)", () => {
    defineWorkflow({ description: "d" })
      .step("first", stub)
      .step("second", stub, { maxRetries: 2, dependsOn: ["first"] })
      .build();
  });

  it("rejects duplicate step ids", () => {
    let threw = false;
    try {
      defineWorkflow({ description: "d" }).step("a", stub).step("a", stub);
    } catch (e) {
      threw = true;
      ok(String(e).includes("duplicate step id 'a'"));
    }
    ok(threw, "expected duplicate id to throw");
  });

  it("factory-form StepInvocation carries the callable's stamped name", () => {
    const factoryAgent = defineAgent<{ x: string }>(() => ({
      type: "worker",
      description: "f",
      modelTier: "light",
      tools: [],
      permissions: "full",
      timeoutSeconds: 60,
      promptContext: [],
      prompt: "p",
    }));
    (factoryAgent as any).name = "my-derived-name";

    const inv = factoryAgent({ x: "v" });
    equal((inv.agent as any).name, "my-derived-name");
  });

  it("requires at least one step before .build()", () => {
    let threw = false;
    try {
      defineWorkflow({ description: "d" }).build();
    } catch (e) {
      threw = true;
      ok(String(e).includes("at least one .step()"));
    }
    ok(threw, "expected empty workflow to throw");
  });
});

describe("defineWorkflow .step() with sub-workflow", () => {
  const stub = defineAgent({
    type: "worker",
    description: "x",
    modelTier: "light",
    tools: [],
    permissions: "full",
    timeoutSeconds: 60,
    promptContext: [],
    prompt: () => "p",
  });
  (stub as any).name = "stub";

  const subWorkflow = defineWorkflow({
    description: "review one note",
    required: ["file"],
  })
    .step("read", stub)
    .build();
  (subWorkflow as any).name = "review-note";

  it("accepts a WorkflowDef as a step value with each.glob + as", () => {
    const wf = defineWorkflow({ description: "outer" })
      .step("reviews", subWorkflow, {
        each: { glob: "notes/*.md" },
        as: "file",
      })
      .build();
    ok(wf.steps[0]);
    equal(wf.steps[0].id, "reviews");
    ok("subWorkflow" in wf.steps[0]);
  });

  it("accepts each.json without as", () => {
    const wf = defineWorkflow({ description: "outer" })
      .step("reviews", subWorkflow, {
        each: { json: "tasks.json" },
      })
      .build();
    ok("subWorkflow" in wf.steps[0]);
  });

  it("accepts each.items without as", () => {
    const wf = defineWorkflow({ description: "outer" })
      .step("reviews", subWorkflow, {
        each: { items: () => [{ file: "a.md" }] },
      })
      .build();
    ok("subWorkflow" in wf.steps[0]);
  });

  it("rejects glob source without as", () => {
    throws(() =>
      defineWorkflow({ description: "outer" })
        .step("reviews", subWorkflow, {
          each: { glob: "notes/*.md" },
        } as never)
        .build(),
    );
  });

  it("rejects concurrency: 0", () => {
    throws(() =>
      defineWorkflow({ description: "outer" })
        .step("reviews", subWorkflow, {
          each: { glob: "notes/*.md" },
          as: "file",
          concurrency: 0,
        })
        .build(),
    );
  });

  it("rejects missing each: when value is a workflow", () => {
    throws(() =>
      defineWorkflow({ description: "outer" })
        .step("reviews", subWorkflow, {} as never)
        .build(),
    );
  });
});
