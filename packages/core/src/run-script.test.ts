import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { runScript, runScriptWith, type ScriptProcess } from "./run-script.js";

function fakeProc(): ScriptProcess & {
  lines: string[];
  exitCode: number | undefined;
  sigint: (() => void) | undefined;
  fireSigint: () => void;
} {
  const proc = {
    lines: [] as string[],
    exitCode: undefined as number | undefined,
    sigint: undefined as (() => void) | undefined,
    onceSigint(handler: () => void) {
      proc.sigint = handler;
    },
    removeSigint(handler: () => void) {
      if (proc.sigint === handler) proc.sigint = undefined;
    },
    stderr(line: string) {
      proc.lines.push(line);
    },
    setExitCode(code: number) {
      proc.exitCode = code;
    },
    fireSigint() {
      proc.sigint?.();
      proc.sigint = undefined; // mirror process.once semantics
    },
  };
  return proc;
}

describe("runScriptWith", () => {
  it("runs to completion silently and leaves the exit code untouched", async () => {
    const proc = fakeProc();
    let sawSignal: AbortSignal | undefined;
    await runScriptWith(proc, "demo", async ({ signal }) => {
      sawSignal = signal;
    });
    strictEqual(sawSignal?.aborted, false);
    deepStrictEqual(proc.lines, []);
    strictEqual(proc.exitCode, undefined);
  });

  it("prints '<name> failed: <message>' and sets exit code 1 on error", async () => {
    const proc = fakeProc();
    await runScriptWith(proc, "demo", async () => {
      throw new Error("boom");
    });
    deepStrictEqual(proc.lines, ["demo failed: boom"]);
    strictEqual(proc.exitCode, 1);
  });

  it("aborts the signal on SIGINT and exits 130 when fn rejects with AbortError", async () => {
    const proc = fakeProc();
    await runScriptWith(proc, "demo", async ({ signal }) => {
      proc.fireSigint();
      strictEqual(signal.aborted, true);
      throw new DOMException("Aborted", "AbortError");
    });
    deepStrictEqual(proc.lines, ["\n^C - aborting...", "demo cancelled"]);
    strictEqual(proc.exitCode, 130);
  });

  it("treats any error named AbortError as cancellation, not failure", async () => {
    const proc = fakeProc();
    const err = new Error("wrapped abort");
    err.name = "AbortError";
    await runScriptWith(proc, "demo", async () => {
      throw err;
    });
    deepStrictEqual(proc.lines, ["demo cancelled"]);
    strictEqual(proc.exitCode, 130);
  });

  it("removes the SIGINT handler after fn settles", async () => {
    const proc = fakeProc();
    await runScriptWith(proc, "demo", async () => {});
    strictEqual(proc.sigint, undefined);
  });
});

describe("runScript", () => {
  it("provides a live signal and resolves without touching process.exitCode", async () => {
    const before = process.exitCode;
    const listenersBefore = process.listenerCount("SIGINT");
    let aborted: boolean | undefined;
    await runScript(async ({ signal }) => {
      aborted = signal.aborted;
    });
    strictEqual(aborted, false);
    strictEqual(process.exitCode, before);
    strictEqual(process.listenerCount("SIGINT"), listenersBefore);
  });
});
