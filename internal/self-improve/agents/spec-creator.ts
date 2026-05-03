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
2. Decide trivial / small / substantial based on the suggested_change scope and what you read.
3. Write the spec to ${spec_filepath}. (That directory is gitignored - the spec is local scaffolding, not committed.)
4. The first line of the spec file must be exactly \`SIZE: trivial\`, \`SIZE: small\`, or \`SIZE: substantial\` - no markdown formatting, no heading prefix, no surrounding whitespace, no \`SIZE:\` inside a code fence. Second line is blank, then the spec body begins. Downstream agents grep for this exact format.
5. Lead your final text response with a one-line summary of what you wrote.

Constraints: the only file you may create is the spec at the path above. If the spec would benefit from a companion file (fixture, snippet, etc.), describe it inline in the spec instead of creating it. Do not write outside docs/superpowers/specs/. Do not run bash. Do not edit existing source files.`,
  };
});
