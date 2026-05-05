import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { GenerataPrecheckError } from "./errors.js";

describe("GenerataPrecheckError", () => {
  it("carries workflow name and structured issues", () => {
    const err = new GenerataPrecheckError("myflow", [
      { stepId: "a", message: "missing arg" },
      { stepId: "b", message: "bad path" },
    ]);
    ok(err instanceof Error);
    ok(err instanceof GenerataPrecheckError);
    equal(err.workflow, "myflow");
    equal(err.issues.length, 2);
    equal(err.name, "GenerataPrecheckError");
    ok(err.message.includes("myflow"));
    ok(err.message.includes("2"));
  });
});
