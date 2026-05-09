import { defineAgent } from "@generata/core";

export default defineAgent<{
  slug: string;
  description: string;
  evidence_paths: string;
  suggested_change: string;
}>(({ slug, description, evidence_paths, suggested_change, today, work_dir }) => {
  const spec_filepath = `${work_dir}/../../docs/superpowers/specs/${today}-${slug}-design.md`;
  return {
    type: "worker",
    description:
      "Writes a spec for the picked improvement, sized to the change (trivial / small / substantial).",
    modelTier: "standard",
    permissions: "full",
    tools: ["write"],
    timeoutSeconds: 300,
    outputs: {
      spec_filepath: "Absolute path to the spec file you wrote (use the path shown in the prompt)",
    },
    prompt: `
Picked item:
- slug: ${slug}
- description: ${description}
- evidence_paths (comma-separated): ${evidence_paths}
- suggested_change: ${suggested_change}

Write the spec to: ${spec_filepath}

Sizing rule (decide which applies, then write to that size):
- TRIVIAL (typo, one-line fix, doc tweak): spec is 1-3 sentences total, no headings.
- SMALL (single-file change, no new public API): spec is one short section, ~150 words.
- SUBSTANTIAL (multi-file, new exports, behavioural change): full multi-section spec with Goal, Non-goals, Approach, Open questions.

When in doubt between two sizes, pick the SMALLER. The plan-creator can escalate if needed; downsizing later wastes spec output.

Procedure:
1. Read the evidence files (using read/grep tools) to ground the spec in current code. Skim around the cited line ranges to confirm the issue is real. Split the comma-separated evidence_paths above (each entry may have a trailing \`:line\` or \`:line-line\` suffix - strip that to get the file path).
2. **No-breaking-changes rule.** This loop ships only \`patch\`/\`minor\`/\`none\` bumps; majors are reserved for human review. The public surface of \`@generata/core\` is whatever \`packages/core/src/define.ts\` exports (and the types it re-exports from \`schema.ts\`). If the picked item can only be addressed by a breaking change to that surface (renaming/removing exports, changing required parameters, narrowing return types, etc.), DEFER it to \`internal/ideas/\`:
   - Write an idea capture to \`${work_dir}/last-idea.md\` (overwrite if it exists). Format (markdown, no frontmatter):
     \`\`\`
     # <Title - the suggested_change rephrased as an idea title>

     ## Problem
     <One paragraph: what the picked item is, why solving it requires breaking the public API of @generata/core, and which exports are affected.>

     ## Open questions
     - <each open question on its own line, prefixed with "- ">

     ## Notes
     - kind: breaking-change
     - source: improve loop deferral (slug: ${slug})
     - evidence: ${evidence_paths}
     \`\`\`
   - Then halt with reason "deferred-to-ideas: ${slug}" (verbatim - the loop parses this prefix to move the file into \`internal/ideas/\` and remove the item from IMPROVEMENTS.md).
   - Do not write a spec for this run. Additive changes (new exports, new optional fields, new flags) are fine - they are \`minor\`, not \`major\`, and you should write a spec as normal.
3. Decide trivial / small / substantial based on the suggested_change scope and what you read.
4. Write the spec to ${spec_filepath}. (That directory is gitignored - the spec is local scaffolding, not committed.)
5. The first line of the spec file must be exactly \`SIZE: trivial\`, \`SIZE: small\`, or \`SIZE: substantial\` - no markdown formatting, no heading prefix, no surrounding whitespace, no \`SIZE:\` inside a code fence. Second line is blank, then the spec body begins. Downstream agents grep for this exact format.
6. Lead your final text response with a one-line summary of what you wrote.

Constraints: the only files you may create are the spec at the path above and (when deferring per the no-breaking-changes rule) \`${work_dir}/last-idea.md\`. If the spec would benefit from a companion file (fixture, snippet, etc.), describe it inline in the spec instead of creating it. Do not write outside docs/superpowers/specs/ or last-idea.md. Do not run bash. Do not edit existing source files.`,
  };
});
