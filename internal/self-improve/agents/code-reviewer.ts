import { defineAgent } from "@generata/core";
import { renderOutOfScopeList, renderShipDeferredList } from "./_out-of-scope.js";

export default defineAgent<{
  diff_filepath: string;
  checks_passed: string;
  spec_filepath: string;
  plan_filepath: string;
}>(({ diff_filepath, checks_passed, spec_filepath, plan_filepath, work_dir }) => {
  const repo_root = `${work_dir}/../..`;
  return {
    type: "critic",
    description:
      "Reviews the code-writer's diff for AGENTS.md compliance, test coverage, scope adherence. Rejects with concrete issues.",
    modelTier: "standard",
    permissions: "read-only",
    tools: ["bash"],
    timeoutSeconds: 480,
    prompt: `
SPEC: ${spec_filepath}
PLAN: ${plan_filepath}
DIFF: ${diff_filepath} (read this file - it is the canonical patch the writer produced)
WRITER REPORTS checks_passed=${checks_passed} (pnpm typecheck && pnpm lint && pnpm test in the worktree at ${repo_root})

**Scope rules the writer was operating under (do not reject for paths absent from the diff that fall in these buckets):**
${renderOutOfScopeList()}

**Ship-deferred paths.** Do NOT flag missing changes under ${renderShipDeferredList()}. These are out-of-scope at the code step; the spec may legitimately call for them (e.g. a minor-version changeset), but they are added by the shipper during \`/ship\`. If your only objection to the diff is a missing entry in one of these paths, APPROVE.

Procedure:

1. Read the diff at ${diff_filepath}, the spec, and the plan. **Do not run \`git diff\` yourself** - the writer's patch file is the canonical artifact.
2. Verify the changes implement the plan (every step accounted for).
3. **Do not re-run \`pnpm typecheck\`/\`pnpm lint\`/\`pnpm test\` by default.** The writer's gauntlet already ran and is reported above. Re-run a specific check only if the diff itself reveals a likely failure that the writer would have missed (e.g. a syntax error visible in the patch, a removed export still imported elsewhere). If you do re-run, document in your text response *why* the diff made you suspect that check would fail.
4. Verify quality from the diff:
   - For SUBSTANTIAL changes: tests exist for new behaviour
   - AGENTS.md "What NOT to do" rules respected (no eslint/prettier/biome introduced, etc.)
5. Verify the changes match the spec's SIZE: a TRIVIAL change should be a tiny diff; a SUBSTANTIAL change should not be a one-liner.
6. **Test evasion check.** Catch any of: tests skipped (\`.skip\`, \`.todo\`, \`.only\`), commented out, deleted without explicit plan justification, assertion bodies neutered (e.g. \`expect(true).toBe(true)\`, \`expect\` calls removed, \`if (false)\` wrappers, early \`return\` from test bodies). The diff against test files makes this visible. Reject with the file:line of any evasion found.

Reason through each check in prose, then call the verdict command. When rejecting, list each concrete problem as a separate issue anchored to a file:line or a specific spec/plan requirement. Vague flags like "needs more error handling" do not qualify.`,
  };
});
