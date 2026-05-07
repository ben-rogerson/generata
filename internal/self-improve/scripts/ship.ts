// Deterministic shipper. Replaces the LLM `shipper` agent (which silently
// reported success without actually opening PRs). Inputs are the typed values
// the change-summariser already emits, so there's no LLM judgement left in
// shipping - just a procedural sequence of git/pnpm/gh calls.
//
// Mirrors the project's `/ship` slash-command (`.claude/skills/ship/SKILL.md`)
// for the loop's narrow case (single-package `@generata/core` bumps, branch
// derived from the commit subject's conventional-commit type, validation
// re-run in the main repo as a final gate).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

    const mainRepoRoot = await deriveMainRepoRoot(inputs.worktreeRoot);
    console.log(`→ ship: preflight ${mainRepoRoot}`);
    const status = await git(mainRepoRoot, ["status", "--porcelain"]);
    if (status.trim() !== "") {
      return {
        ok: false,
        reason: `main repo has uncommitted changes; clean or commit before shipping. git status --porcelain:\n${status}`,
      };
    }

    console.log(`→ ship: branch ${branch}`);
    await git(mainRepoRoot, ["checkout", "main"]);
    await git(mainRepoRoot, ["pull", "--ff-only", "origin", "main"]);
    await git(mainRepoRoot, ["checkout", "-b", branch]);

    console.log(`→ ship: discover changed files in ${inputs.worktreeRoot}`);
    const changedRaw = await git(inputs.worktreeRoot, ["diff", "--name-only", "HEAD"]);
    const changed = changedRaw.split("\n").filter(Boolean);
    if (changed.length === 0) {
      return { ok: false, reason: "no changes in worktree to ship" };
    }
    console.log(`  ${changed.length} file(s): ${changed.join(", ")}`);

    console.log(`→ ship: copy worktree → main`);
    for (const rel of changed) {
      const src = resolve(inputs.worktreeRoot, rel);
      const dst = resolve(mainRepoRoot, rel);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }

    console.log(`→ ship: validate in main (typecheck, lint, test)`);
    await pnpm(mainRepoRoot, ["typecheck"]);
    await pnpm(mainRepoRoot, ["lint"]);
    await pnpm(mainRepoRoot, ["test"]);

    console.log(`→ ship: commit`);
    await git(mainRepoRoot, ["add", ...changed]);
    await git(mainRepoRoot, ["commit", "-m", inputs.commitSubject, "-m", inputs.commitBody]);

    if (inputs.bump !== "none") {
      console.log(`→ ship: changeset (${inputs.bump})`);
      const changesetRel = `.changeset/${inputs.slug}.md`;
      const changesetPath = resolve(mainRepoRoot, changesetRel);
      const body = `---\n"@generata/core": ${inputs.bump}\n---\n\n${inputs.commitSubject}\n`;
      writeFileSync(changesetPath, body);
      await git(mainRepoRoot, ["add", changesetRel]);
      await git(mainRepoRoot, ["commit", "-m", "chore: add changeset"]);
    }

    console.log(`→ ship: push origin ${branch}`);
    await git(mainRepoRoot, ["push", "-u", "origin", branch]);

    console.log(`→ ship: gh pr create`);
    const prBody = buildPrBody(inputs);
    const prOut = await gh(mainRepoRoot, [
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

async function deriveMainRepoRoot(worktreeRoot: string): Promise<string> {
  // `git worktree list --porcelain` reports the main worktree first, then
  // every linked worktree. Each block starts with `worktree <abs-path>`. The
  // first such path is the main repo regardless of which worktree we ask.
  const out = await git(worktreeRoot, ["worktree", "list", "--porcelain"]);
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) return line.slice("worktree ".length).trim();
  }
  throw new Error(`failed to derive main repo from worktree at ${worktreeRoot}`);
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
