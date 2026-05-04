import { describe, it } from "node:test";
import { deepEqual, rejects } from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialiseSource } from "./sources.js";

const builtins = { work_dir: "/tmp", today: "2026-05-04", time: "10:00:00" };

describe("materialiseSource", () => {
  describe("glob", () => {
    it("returns matched files lex-sorted by full path", async () => {
      const dir = mkdtempSync(join(tmpdir(), "loop-sources-"));
      try {
        writeFileSync(join(dir, "zebra.md"), "");
        writeFileSync(join(dir, "Apple.md"), "");
        writeFileSync(join(dir, "banana.md"), "");
        const result = await materialiseSource(
          { glob: `${dir}/*.md` },
          { ...builtins, work_dir: dir },
        );
        deepEqual(result, [`${dir}/Apple.md`, `${dir}/banana.md`, `${dir}/zebra.md`]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns empty array when nothing matches", async () => {
      const dir = mkdtempSync(join(tmpdir(), "loop-sources-"));
      try {
        const result = await materialiseSource(
          { glob: `${dir}/*.md` },
          { ...builtins, work_dir: dir },
        );
        deepEqual(result, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("sorts subdirectory paths after sibling files at the same prefix", async () => {
      const dir = mkdtempSync(join(tmpdir(), "loop-sources-"));
      try {
        writeFileSync(join(dir, "banana.md"), "");
        mkdirSync(join(dir, "sub"));
        writeFileSync(join(dir, "sub", "alpha.md"), "");
        const result = await materialiseSource(
          { glob: `${dir}/**/*.md` },
          { ...builtins, work_dir: dir },
        );
        deepEqual(result, [`${dir}/banana.md`, `${dir}/sub/alpha.md`]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("json", () => {
    it("returns the parsed array as-is, preserving order", async () => {
      const dir = mkdtempSync(join(tmpdir(), "loop-sources-"));
      try {
        const path = join(dir, "tasks.json");
        writeFileSync(path, JSON.stringify([{ id: "1" }, { id: "2" }]));
        const result = await materialiseSource({ json: path }, { ...builtins, work_dir: dir });
        deepEqual(result, [{ id: "1" }, { id: "2" }]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("rejects when file is missing", async () => {
      await rejects(
        () => materialiseSource({ json: "/nonexistent/tasks.json" }, builtins),
        /tasks\.json/,
      );
    });

    it("rejects when JSON does not parse to an array", async () => {
      const dir = mkdtempSync(join(tmpdir(), "loop-sources-"));
      try {
        const path = join(dir, "obj.json");
        writeFileSync(path, JSON.stringify({ not: "array" }));
        await rejects(() => materialiseSource({ json: path }, builtins), /must parse to an array/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("items", () => {
    it("invokes the function with builtins and returns its array", async () => {
      const result = await materialiseSource(
        { items: ({ work_dir }) => [`${work_dir}/a`, `${work_dir}/b`] },
        builtins,
      );
      deepEqual(result, ["/tmp/a", "/tmp/b"]);
    });

    it("awaits async functions", async () => {
      const result = await materialiseSource({ items: async () => [1, 2, 3] }, builtins);
      deepEqual(result, [1, 2, 3]);
    });

    it("rejects when the function returns a non-array", async () => {
      await rejects(
        () => materialiseSource({ items: () => "not an array" as never }, builtins),
        /must return an array/,
      );
    });

    it("propagates errors thrown by the function", async () => {
      await rejects(
        () =>
          materialiseSource(
            {
              items: () => {
                throw new Error("boom");
              },
            },
            builtins,
          ),
        /boom/,
      );
    });
  });
});
