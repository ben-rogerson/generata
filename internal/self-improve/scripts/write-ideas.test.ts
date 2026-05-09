import { equal, deepEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { slugify, renderIdeaMd, writeIdeas, formatSummary, type Dream } from "./write-ideas.js";

describe("slugify", () => {
  it("lowercases and joins runs of non-alphanumerics with single dashes", () => {
    equal(slugify("Add an \"all options\" section to the README"), "add-an-all-options-section-to-the-readme");
  });
  it("handles already-clean strings", () => {
    equal(slugify("plist scheduling for workflows"), "plist-scheduling-for-workflows");
  });
  it("strips leading/trailing dashes", () => {
    equal(slugify("--Foo Bar--"), "foo-bar");
  });
  it("returns empty string for empty input", () => {
    equal(slugify(""), "");
  });
  it("collapses multiple non-alphanumerics", () => {
    equal(slugify("a / b // c"), "a-b-c");
  });
});

describe("renderIdeaMd", () => {
  const dream: Dream = {
    title: "Add an all options section to the README",
    kind: "adjacent-extension",
    problem: "Users miss config knobs and copy from source.",
    openQuestions: ["How to keep this in sync?", "Codegen or manual?"],
    notes: "First note\nSecond note",
  };

  it("renders the documented shape with kind as the leading Notes bullet", () => {
    const out = renderIdeaMd(dream);
    equal(
      out,
      [
        "# Add an all options section to the README",
        "",
        "## Problem",
        "Users miss config knobs and copy from source.",
        "",
        "## Open questions",
        "- How to keep this in sync?",
        "- Codegen or manual?",
        "",
        "## Notes",
        "- kind: adjacent-extension",
        "- First note",
        "- Second note",
        "",
      ].join("\n"),
    );
  });

  it("emits Notes with only the kind bullet when notes is missing", () => {
    const out = renderIdeaMd({ ...dream, notes: undefined });
    const lines = out.split("\n");
    const notesIdx = lines.indexOf("## Notes");
    equal(lines[notesIdx + 1], "- kind: adjacent-extension");
    equal(lines[notesIdx + 2], "");
  });
});

describe("writeIdeas", () => {
  function tmp(): string {
    return mkdtempSync(join(tmpdir(), "writeideas-"));
  }
  const fixedNow = new Date("2026-05-08T10:00:00");

  it("writes a single valid dream to a date-prefixed file", () => {
    const dir = tmp();
    const json = JSON.stringify([
      {
        title: "Foo bar baz",
        kind: "big-swing",
        problem: "Why",
        openQuestions: ["Q?"],
      },
    ]);
    const summary = writeIdeas(json, dir, fixedNow);
    deepEqual(summary.written, ["2026-05-08-foo-bar-baz.md"]);
    deepEqual(summary.skipped, []);
    deepEqual(summary.rejected, []);
    const body = readFileSync(join(dir, "2026-05-08-foo-bar-baz.md"), "utf8");
    equal(body.startsWith("# Foo bar baz\n"), true);
    equal(body.includes("- kind: big-swing"), true);
  });

  it("skips a dream whose slug matches an existing file with a different date prefix", () => {
    const dir = tmp();
    writeFileSync(join(dir, "2026-04-30-foo-bar.md"), "# Foo bar\n");
    const json = JSON.stringify([
      { title: "Foo bar", kind: "big-swing", problem: "p", openQuestions: [] },
    ]);
    const summary = writeIdeas(json, dir, fixedNow);
    deepEqual(summary.written, []);
    deepEqual(summary.skipped, ["foo-bar"]);
    equal(readFileSync(join(dir, "2026-04-30-foo-bar.md"), "utf8"), "# Foo bar\n");
  });

  it("first-wins within a single run when two dreams share a slug", () => {
    const dir = tmp();
    const json = JSON.stringify([
      { title: "Same name", kind: "big-swing", problem: "a", openQuestions: [] },
      { title: "Same name", kind: "adjacent-extension", problem: "b", openQuestions: [] },
    ]);
    const summary = writeIdeas(json, dir, fixedNow);
    deepEqual(summary.written, ["2026-05-08-same-name.md"]);
    deepEqual(summary.skipped, ["same-name"]);
    const body = readFileSync(join(dir, "2026-05-08-same-name.md"), "utf8");
    equal(body.includes("- kind: big-swing"), true);
  });

  it("rejects entries with missing or invalid fields and continues", () => {
    const dir = tmp();
    const json = JSON.stringify([
      { title: "", kind: "big-swing", problem: "p", openQuestions: [] },
      { title: "Good one", kind: "big-swing", problem: "p", openQuestions: [] },
      { title: "Bad kind", kind: "wat", problem: "p", openQuestions: [] },
    ]);
    const summary = writeIdeas(json, dir, fixedNow);
    deepEqual(summary.written, ["2026-05-08-good-one.md"]);
    equal(summary.rejected.length, 2);
  });

  it("creates ideasDir if it does not exist", () => {
    const dir = join(tmp(), "nested", "dreams");
    const json = JSON.stringify([
      { title: "Hello", kind: "big-swing", problem: "p", openQuestions: [] },
    ]);
    writeIdeas(json, dir, fixedNow);
    equal(readdirSync(dir).length, 1);
  });

  it("throws when JSON is unparseable", () => {
    throws(() => writeIdeas("not json", tmp(), fixedNow), /JSON/i);
  });

  it("throws when JSON parses to a non-array", () => {
    throws(() => writeIdeas('{"not":"an array"}', tmp(), fixedNow), /array/i);
  });
});

describe("formatSummary", () => {
  it("formats a one-liner with all three counts", () => {
    const s = formatSummary({
      written: ["a.md", "b.md"],
      skipped: ["c"],
      rejected: ["bad-1", "bad-2", "bad-3"],
    });
    equal(s, "wrote 2, skipped 1 (existing), rejected 3 (invalid)");
  });
});
