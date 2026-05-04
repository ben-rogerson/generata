import { describe, it } from "node:test";
import { deepEqual } from "node:assert/strict";
import { bindItems } from "./binding.js";

describe("bindItems", () => {
  it("binds string items under the as: name", () => {
    const result = bindItems(["a.md", "b.md"], { as: "file", required: ["file"] });
    deepEqual(result.errors, []);
    deepEqual(result.vars, [{ file: "a.md" }, { file: "b.md" }]);
  });

  it("rejects string items when as: is missing", () => {
    const result = bindItems(["a.md"], { as: undefined, required: ["file"] });
    deepEqual(result.vars, []);
    deepEqual(result.errors.length, 1);
    deepEqual(result.errors[0].includes("as:"), true);
  });

  it("spreads object item keys into the params bag", () => {
    const result = bindItems(
      [
        { id: "1", title: "Foo" },
        { id: "2", title: "Bar" },
      ],
      { as: undefined, required: ["id", "title"] },
    );
    deepEqual(result.errors, []);
    deepEqual(result.vars, [
      { id: "1", title: "Foo" },
      { id: "2", title: "Bar" },
    ]);
  });

  it("auto-stringifies number, boolean, and null values", () => {
    const result = bindItems([{ id: 1, ok: true, note: null }], {
      as: undefined,
      required: ["id", "ok", "note"],
    });
    deepEqual(result.errors, []);
    deepEqual(result.vars, [{ id: "1", ok: "true", note: "null" }]);
  });

  it("JSON-stringifies nested object/array values", () => {
    const result = bindItems([{ id: "1", tags: ["a", "b"], meta: { k: "v" } }], {
      as: undefined,
      required: ["id", "tags", "meta"],
    });
    deepEqual(result.errors, []);
    deepEqual(result.vars, [{ id: "1", tags: '["a","b"]', meta: '{"k":"v"}' }]);
  });

  it("rejects object items when as: is set", () => {
    const result = bindItems([{ id: "1" }], { as: "task", required: ["id"] });
    deepEqual(result.vars, []);
    deepEqual(result.errors.length, 1);
    deepEqual(result.errors[0].includes("as:"), true);
  });

  it("rejects mixed-shape arrays (string + object)", () => {
    const result = bindItems(["a.md", { id: "1" }] as unknown[], {
      as: "file",
      required: ["file"],
    });
    deepEqual(result.vars, []);
    deepEqual(result.errors.length, 1);
    deepEqual(result.errors[0].includes("mixed"), true);
  });

  it("reports missing required keys per offending item index", () => {
    const result = bindItems([{ id: "1", title: "Foo" }, { id: "2" }], {
      as: undefined,
      required: ["id", "title"],
    });
    deepEqual(result.vars, []);
    deepEqual(result.errors.length, 1);
    deepEqual(result.errors[0].includes("index 1"), true);
    deepEqual(result.errors[0].includes("title"), true);
  });

  it("treats undefined values as missing required keys", () => {
    const result = bindItems([{ id: "1", title: undefined }], {
      as: undefined,
      required: ["id", "title"],
    });
    deepEqual(result.vars, []);
    deepEqual(result.errors.length, 1);
    deepEqual(result.errors[0].includes("title"), true);
  });

  it("returns empty vars and no errors for empty input", () => {
    const result = bindItems([], { as: "file", required: ["file"] });
    deepEqual(result.vars, []);
    deepEqual(result.errors, []);
  });
});
