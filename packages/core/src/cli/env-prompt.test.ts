import { strictEqual } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDotEnv } from "./env-prompt.js";

let dir: string;

describe("writeDotEnv", () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "env-prompt-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('quotes and escapes values containing spaces, #, ", and \\', () => {
    const path = join(dir, ".env");
    writeDotEnv({ TRICKY: 'a b#c"d\\e' }, path);
    const contents = readFileSync(path, "utf8");
    strictEqual(contents, 'TRICKY="a b#c\\"d\\\\e"\n');
  });

  it("escapes embedded newlines as \\n", () => {
    const path = join(dir, "newline.env");
    writeDotEnv({ MULTI: "line1\nline2" }, path);
    const contents = readFileSync(path, "utf8");
    strictEqual(contents, 'MULTI="line1\\nline2"\n');
  });

  it("wraps simple values in double quotes", () => {
    const path = join(dir, "simple.env");
    writeDotEnv({ FOO: "bar" }, path);
    const contents = readFileSync(path, "utf8");
    strictEqual(contents, 'FOO="bar"\n');
  });
});
