import { strictEqual, ok } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifySpecifier, resolveTemplate } from "./resolver.js";

describe("classifySpecifier", () => {
  it("classifies catalog aliases", () => {
    strictEqual(classifySpecifier("@generata/coding").kind, "catalog");
  });

  it("classifies github short form", () => {
    const c = classifySpecifier("ben/apexgen");
    strictEqual(c.kind, "github-short");
    if (c.kind === "github-short") strictEqual(c.url, "https://github.com/ben/apexgen.git");
  });

  it("classifies absolute and relative paths", () => {
    strictEqual(classifySpecifier("/abs/path").kind, "local");
    strictEqual(classifySpecifier("./local").kind, "local");
    strictEqual(classifySpecifier("../sibling").kind, "local");
  });

  it("classifies full git URLs", () => {
    strictEqual(classifySpecifier("https://github.com/ben/repo.git").kind, "git-url");
    strictEqual(classifySpecifier("git@github.com:ben/repo.git").kind, "git-url");
  });
});

describe("resolveTemplate (local)", () => {
  let src: string;
  before(() => {
    src = mkdtempSync(join(tmpdir(), "tmpl-src-"));
    mkdirSync(join(src, "agents"), { recursive: true });
    writeFileSync(
      join(src, "generata.template.json"),
      JSON.stringify({ name: "x", description: "y" }),
    );
    writeFileSync(join(src, "agents/foo.ts"), "export default {};\n");
  });
  after(() => rmSync(src, { recursive: true, force: true }));

  it("returns the local path verbatim", async () => {
    const result = await resolveTemplate(src);
    strictEqual(result.dir, src);
    strictEqual(result.cleanup, undefined);
    ok(existsSync(join(result.dir, "generata.template.json")));
  });

  it("throws when local path has no manifest", async () => {
    const empty = mkdtempSync(join(tmpdir(), "tmpl-empty-"));
    try {
      await assertRejects(() => resolveTemplate(empty), /generata\.template\.json/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

async function assertRejects(fn: () => Promise<unknown>, regex: RegExp): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (regex.test(String((err as Error).message))) return;
    throw new Error(`Threw but message did not match ${regex}: ${(err as Error).message}`);
  }
  throw new Error(`Did not throw, expected error matching ${regex}`);
}
