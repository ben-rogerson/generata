// Driver-script harness for the programmatic API. Wraps a script's main fn
// with the canonical lifecycle contract: first SIGINT aborts the provided
// signal (second SIGINT falls through to Node's default hard-kill), AbortError
// exits 130, any other error prints its message and exits 1. Exit codes are
// set via process.exitCode (not process.exit) so stdio flushes naturally.
import { callerName } from "./caller-name.js";

export interface RunScriptContext {
  signal: AbortSignal;
}

// Internal seam: tests inject a fake process surface. Not exported from
// define.ts; callers only ever see runScript(fn).
export interface ScriptProcess {
  onceSigint(handler: () => void): void;
  removeSigint(handler: () => void): void;
  stderr(line: string): void;
  setExitCode(code: number): void;
}

export async function runScriptWith(
  proc: ScriptProcess,
  name: string,
  fn: (ctx: RunScriptContext) => Promise<void>,
): Promise<void> {
  const ac = new AbortController();
  const onSigint = (): void => {
    proc.stderr("\n^C - aborting...");
    ac.abort();
  };
  proc.onceSigint(onSigint);
  try {
    await fn({ signal: ac.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      proc.stderr(`${name} cancelled`);
      proc.setExitCode(130);
    } else {
      proc.stderr(`${name} failed: ${(err as Error).message}`);
      proc.setExitCode(1);
    }
  } finally {
    proc.removeSigint(onSigint);
  }
}

const realProcess: ScriptProcess = {
  onceSigint: (handler) => void process.once("SIGINT", handler),
  removeSigint: (handler) => void process.removeListener("SIGINT", handler),
  stderr: (line) => console.error(line),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

export function runScript(fn: (ctx: RunScriptContext) => Promise<void>): Promise<void> {
  // Name from the calling script's filename ("audit.ts" -> "audit"), matching
  // the convention runWorkflow/runAgent use for prompt-log prefixes.
  return runScriptWith(realProcess, callerName("script"), fn);
}
