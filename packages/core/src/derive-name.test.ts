import { strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveName } from "./derive-name.js";

describe("deriveName", () => {
  it("returns the basename for a file at the root", () => {
    strictEqual(deriveName("/proj/agents", "/proj/agents/echo.ts"), "echo");
  });

  it("preserves subdirectory path with forward slashes", () => {
    strictEqual(
      deriveName("/proj/agents", "/proj/agents/core/plan-dreamer.ts"),
      "core/plan-dreamer",
    );
  });

  it("strips .js extension", () => {
    strictEqual(deriveName("/proj/agents", "/proj/agents/echo.js"), "echo");
  });

  it("rejects an uppercase segment", () => {
    throws(
      () => deriveName("/proj/agents", "/proj/agents/Core/echo.ts"),
      /invalid path segment 'Core'/,
    );
  });

  it("rejects a segment that starts with a digit", () => {
    throws(
      () => deriveName("/proj/agents", "/proj/agents/1foo.ts"),
      /invalid path segment '1foo'/,
    );
  });

  it("rejects a segment with an underscore", () => {
    throws(
      () => deriveName("/proj/agents", "/proj/agents/foo_bar.ts"),
      /invalid path segment 'foo_bar'/,
    );
  });

  it("normalises Windows-style separators to forward slashes", () => {
    strictEqual(
      deriveName("/proj/agents", "/proj/agents/core/plan.ts".replace(/\//g, "/")),
      "core/plan",
    );
  });
});
