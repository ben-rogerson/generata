import { deepEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWorktreeListPorcelain, selectGenerataWorktrees } from "./worktree-prune.js";

const SAMPLE = `worktree /Users/x/repo
HEAD abcd
branch refs/heads/main

worktree /Users/x/repo-worktrees/run1
HEAD ef01
branch refs/heads/generata/wt-run1

worktree /Users/x/repo-worktrees/run2
HEAD ef02
branch refs/heads/feature/other
`;

describe("parseWorktreeListPorcelain", () => {
  it("parses three worktrees with paths and branches", () => {
    const entries = parseWorktreeListPorcelain(SAMPLE);
    deepEqual(entries.length, 3);
    deepEqual(entries[1], { path: "/Users/x/repo-worktrees/run1", branch: "generata/wt-run1" });
  });
});

describe("selectGenerataWorktrees", () => {
  it("filters to entries whose branch matches generata/wt-*", () => {
    const entries = parseWorktreeListPorcelain(SAMPLE);
    const selected = selectGenerataWorktrees(entries);
    deepEqual(
      selected.map((e) => e.branch),
      ["generata/wt-run1"],
    );
  });
});
