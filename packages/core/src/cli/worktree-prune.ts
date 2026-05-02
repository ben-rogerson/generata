import { spawn } from "node:child_process";
import { findProjectRoot } from "../find-project-root.js";
import { fmt } from "../logger.js";

export interface WorktreeEntry {
  path: string;
  branch: string;
}

export function parseWorktreeListPorcelain(input: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: { path?: string; branch?: string } = {};
  for (const line of input.split("\n")) {
    if (line === "") {
      if (current.path && current.branch) entries.push({ path: current.path, branch: current.branch });
      current = {};
      continue;
    }
    if (line.startsWith("worktree ")) current.path = line.slice("worktree ".length);
    else if (line.startsWith("branch refs/heads/")) current.branch = line.slice("branch refs/heads/".length);
  }
  if (current.path && current.branch) entries.push({ path: current.path, branch: current.branch });
  return entries;
}

export function selectGenerataWorktrees(entries: WorktreeEntry[]): WorktreeEntry[] {
  return entries.filter((e) => e.branch.startsWith("generata/wt-"));
}

async function run(cmd: string[], cwd: string): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd[0], cmd.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.on("close", (code) => resolve({ stdout, exitCode: code ?? 1 }));
  });
}

export async function runWorktreePrune(): Promise<void> {
  // Anchored on the generata project root (not the git root) so this runs from
  // anywhere inside the project. Git itself discovers the worktree set from
  // there - the working dir for the spawned commands just needs to be inside
  // the repo.
  const project = findProjectRoot();
  const { stdout: listOut, exitCode } = await run(["git", "worktree", "list", "--porcelain"], project);
  if (exitCode !== 0) {
    console.error(fmt.fail("git worktree list failed - is this a git repo?"));
    process.exit(1);
  }
  const matches = selectGenerataWorktrees(parseWorktreeListPorcelain(listOut));
  if (matches.length === 0) {
    console.log(fmt.dim("No generata worktrees to prune."));
    return;
  }
  for (const m of matches) {
    console.log(`Removing ${m.path} (branch ${m.branch})`);
    await run(["git", "worktree", "remove", "--force", m.path], project);
    await run(["git", "branch", "-D", m.branch], project);
  }
  console.log(fmt.bold(`Pruned ${matches.length} worktree${matches.length === 1 ? "" : "s"}.`));
}
