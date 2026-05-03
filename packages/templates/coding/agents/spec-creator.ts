import { defineAgent } from "@generata/core";

export default defineAgent<{ output_dir: string; random_pick: string }>(
  ({ output_dir, random_pick }) => ({
    type: "worker",
    description:
      "Reads NOTES.md, picks an idea at random, writes SPEC.md, emits spec_filepath + instructions outputs",
    modelTier: "standard",
    permissions: "full",
    tools: ["write", "bash"],
    promptContext: [{ filepath: "NOTES.md" }],
    timeoutSeconds: 180,
    outputs: {
      spec_filepath: "Absolute path to the SPEC.md file you wrote",
      instructions: "2-4 sentence summary of what to build and the key acceptance criteria",
    },
    promptTemplate: `
You are deciding what to build next.

Selection is random, not subjective. Follow these steps exactly:

1. Read NOTES.md.
2. Build the list of UNBUILT ideas: enumerate every idea in NOTES.md in document order. For each, derive its kebab-case slug from the bolded title (strip leading/trailing punctuation and whitespace, lowercase, replace runs of non-alphanumeric characters with single dashes - e.g. "**Terminal weather card.**" -> "terminal-weather-card"). Skip any idea whose slug matches an existing directory under ${output_dir}/. Number the survivors 0..N-1 and write the numbered list out in your reasoning so the choice is auditable.
3. If N is 0, halt the workflow with reason "no unbuilt ideas in NOTES.md". Do not write a spec.
4. Compute index = ${random_pick} mod N. Pick the idea at that index. Do not second-guess this - the random seed is the choice.
5. Reason briefly about how to scope and build that idea. Then:
   a. Decide on a kebab-case slug for the project (the slug you derived in step 2 is fine).
   b. Create the project directory: \`mkdir -p ${output_dir}/<slug>\`
   c. Write the spec to \`${output_dir}/<slug>/SPEC.md\` with these sections:
      - **Problem** (one paragraph: what the user need is)
      - **Goals** (bullet list of what the project must do)
      - **Non-goals** (bullet list of what is explicitly out of scope)
      - **Acceptance criteria** (bullet list of testable outcomes)
      - **Constraints** (tech stack, deployment target, anything fixed)`,
  }),
);
