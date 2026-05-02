import { strictEqual, ok, match } from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowDef } from "@generata/core";
import { generateSlashCommands } from "./slash-commands.js";

const workflow: WorkflowDef = {
  name: "execute-plan",
  description: "Execute a plan with post-validation",
  required: ["plan_name"],
  variables: { plans_dir: "plans", output_dir: "projects" },
  steps: [],
} as unknown as WorkflowDef;

describe("generateSlashCommands", () => {
  it("writes one .md per workflow with frontmatter and bash invocation", () => {
    const dest = mkdtempSync(join(tmpdir(), "skills-"));
    try {
      generateSlashCommands({ workflows: [workflow], destDir: dest });
      const out = readFileSync(join(dest, "execute-plan.md"), "utf8");
      match(out, /^---/m);
      match(out, /description: Execute a plan with post-validation/);
      match(out, /argument-hint: --plan_name/);
      match(out, /pnpm generata execute-plan \$ARGUMENTS/);
      match(out, /Variables: plans_dir, output_dir/);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("overwrites existing files (idempotent)", () => {
    const dest = mkdtempSync(join(tmpdir(), "skills-"));
    try {
      generateSlashCommands({ workflows: [workflow], destDir: dest });
      const first = readFileSync(join(dest, "execute-plan.md"), "utf8");
      generateSlashCommands({ workflows: [workflow], destDir: dest });
      const second = readFileSync(join(dest, "execute-plan.md"), "utf8");
      strictEqual(first, second);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("creates the dest dir if missing", () => {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    const dest = join(root, "nested", "commands");
    try {
      generateSlashCommands({ workflows: [workflow], destDir: dest });
      ok(readFileSync(join(dest, "execute-plan.md"), "utf8"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
