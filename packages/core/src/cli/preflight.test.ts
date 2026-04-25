import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { runPreflight } from "./preflight.js";

describe("runPreflight", () => {
  it("reports all bins ok when present (uses 'node' which is always available in test)", async () => {
    const report = await runPreflight([{ name: "node", optional: false }]);
    strictEqual(report.ok, true);
    strictEqual(report.missing.length, 0);
  });

  it("flags missing required bins as not ok", async () => {
    const report = await runPreflight([{ name: "definitely-not-a-real-bin-xyz", optional: false }]);
    strictEqual(report.ok, false);
    deepStrictEqual(
      report.missing.map((m) => m.name),
      ["definitely-not-a-real-bin-xyz"],
    );
  });

  it("optional missing bins do not fail the report", async () => {
    const report = await runPreflight([{ name: "definitely-not-a-real-bin-xyz", optional: true }]);
    strictEqual(report.ok, true);
    strictEqual(report.missing.length, 0);
    strictEqual(report.optionalMissing.length, 1);
  });

  it("includes the hint in the missing entry when provided", async () => {
    const report = await runPreflight([
      { name: "definitely-not-a-real-bin-xyz", optional: false, hint: "brew install xyz" },
    ]);
    strictEqual(report.missing[0].hint, "brew install xyz");
  });
});
