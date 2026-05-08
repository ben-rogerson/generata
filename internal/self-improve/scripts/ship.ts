// Deterministic shipper. Operates entirely inside the worktree the workflow
// ran in:
//   1. Rename the auto-generated worktree branch (`generata/wt-<runId>`)
//      to the semantic `<type>/<slug>` derived from the commit subject.
//   2. Validate (typecheck, lint, test) using the worktree's own node_modules.
//   3. Commit + write+commit changeset + push + open PR.
// Local main is never touched - the worktree is the source of truth for the
// unit of work, and it was already created off origin/main by setupWorktree.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface ShipInputs {
  slug: string;
  bump: "patch" | "minor" | "none";
  commitSubject: string;
  commitBody: string;
  // Path to the worktree the workflow ran in. Required: this is where the
  // writer's edits live and where last-diff.patch was captured.
  worktreeRoot: string;
}

export type ShipResult =
  | { ok: true; prUrl: string; branch: string }
  | { ok: false; reason: string };

const CONVENTIONAL_TYPES = ["feat", "fix", "chore", "docs", "refactor", "test", "ci"] as const;

export async function runShipper(inputs: ShipInputs): Promise<ShipResult> {
  try {
    if (!(["patch", "minor", "none"] as const).includes(inputs.bump)) {
      return {
        ok: false,
        reason: `unsupported bump '${inputs.bump}' (expected patch | minor | none; major needs human review)`,
      };
    }

    const typeMatch = inputs.commitSubject.match(
      new RegExp(`^(${CONVENTIONAL_TYPES.join("|")})\\b`),
    );
    if (!typeMatch) {
      return {
        ok: false,
        reason: `commit subject must start with a conventional-commit type (${CONVENTIONAL_TYPES.join("|")}), got: '${inputs.commitSubject}'`,
      };
    }
    const branch = `${typeMatch[1]}/${inputs.slug}`;
    const wt = inputs.worktreeRoot;

    console.log(`→ ship: rename worktree branch → ${branch}`);
    const wtBranch = (await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    // Two-arg form is explicit: rename `wtBranch` to `branch`. Errors if
    // `branch` already exists - intentional, don't force-rename.
    await git(wt, ["branch", "-m", wtBranch, branch]);

    console.log(`→ ship: discover changed files in ${wt}`);
    const changedRaw = await git(wt, ["diff", "--name-only", "HEAD"]);
    const changed = changedRaw.split("\n").filter(Boolean);
    if (changed.length === 0) {
      return { ok: false, reason: "no changes in worktree to ship" };
    }
    console.log(`  ${changed.length} file(s): ${changed.join(", ")}`);

    console.log(`→ ship: validate (typecheck, lint, test)`);
    await pnpm(wt, ["typecheck"]);
    await pnpm(wt, ["lint"]);
    await pnpm(wt, ["test"]);

    console.log(`→ ship: commit`);
    await git(wt, ["add", ...changed]);
    await git(wt, ["commit", "-m", inputs.commitSubject, "-m", inputs.commitBody]);

    if (inputs.bump !== "none") {
      console.log(`→ ship: changeset (${inputs.bump})`);
      const changesetRel = `.changeset/${inputs.slug}.md`;
      const changesetPath = resolve(wt, changesetRel);
      const body = `---\n"@generata/core": ${inputs.bump}\n---\n\n${inputs.commitSubject}\n`;
      writeFileSync(changesetPath, body);
      await git(wt, ["add", changesetRel]);
      await git(wt, ["commit", "-m", "chore: add changeset"]);
    }

    console.log(`→ ship: push origin ${branch}`);
    await git(wt, ["push", "-u", "origin", branch]);

    console.log(`→ ship: gh pr create`);
    const prBody = buildPrBody(inputs);
    const prOut = await gh(wt, [
      "pr",
      "create",
      "--title",
      inputs.commitSubject,
      "--body",
      prBody,
    ]);
    const prUrl = prOut.trim().split("\n").pop() ?? prOut.trim();

    console.log(`✓ shipped: ${prUrl}`);
    return { ok: true, prUrl, branch };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  return run("git", args, cwd);
}

async function pnpm(cwd: string, args: string[]): Promise<string> {
  return run("pnpm", args, cwd);
}

async function gh(cwd: string, args: string[]): Promise<string> {
  return run("gh", args, cwd);
}

async function run(cmd: string, args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileP(cmd, args, {
    cwd,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (stderr) process.stderr.write(stderr);
  return stdout;
}

function buildPrBody(inputs: ShipInputs): string {
  return `## Summary

${inputs.commitBody}

## Test plan
- [x] \`pnpm typecheck\`
- [x] \`pnpm lint\`
- [x] \`pnpm test\`
`;
}
