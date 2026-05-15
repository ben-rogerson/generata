import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { promptForEnv, writeDotEnv, PromptItem } from "./env-prompt.js";

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

function runPrompt(items: PromptItem[], lines: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let captured = "";
  let idx = 0;
  output.on("data", (chunk) => {
    const s = chunk.toString();
    captured += s;
    if (s.includes("> ") && idx < lines.length) {
      input.write(lines[idx++] + "\n");
    }
  });
  const promise = promptForEnv(items, {}, input, output);
  return { promise, getOutput: () => captured };
}

describe("promptForEnv", () => {
  it("re-prompts when required answer is empty until non-empty is given", async () => {
    const items: PromptItem[] = [
      { key: "FOO", description: "foo desc", required: true, secret: false },
    ];
    const { promise, getOutput } = runPrompt(items, ["", "  ", "real"]);
    const result = await promise;
    deepStrictEqual(result, { FOO: "real" });
    const promptCount = getOutput().split("FOO\n").length - 1;
    strictEqual(promptCount, 3);
  });

  it("accepts non-empty required answer on first try", async () => {
    const items: PromptItem[] = [
      { key: "BAR", description: "bar desc", required: true, secret: false },
    ];
    const { promise, getOutput } = runPrompt(items, ["value"]);
    const result = await promise;
    deepStrictEqual(result, { BAR: "value" });
    const promptCount = getOutput().split("BAR\n").length - 1;
    strictEqual(promptCount, 1);
  });

  it("skips optional fields when answer is empty (no re-prompt)", async () => {
    const items: PromptItem[] = [
      { key: "OPT", description: "opt desc", required: false, secret: false },
    ];
    const { promise } = runPrompt(items, [""]);
    const result = await promise;
    deepStrictEqual(result, {});
  });

  it("preserves existing values and does not prompt for them", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const items: PromptItem[] = [
      { key: "KEEP", description: "kept", required: true, secret: false },
    ];
    const result = await promptForEnv(items, { KEEP: "already" }, input, output);
    deepStrictEqual(result, { KEEP: "already" });
  });
});
