import { defineAgent } from "@generata/core";

export default defineAgent<{
  spec_filepath: string;
  instructions: string;
  output_dir: string;
}>(({ spec_filepath, instructions, output_dir }) => {
  const project_dir = spec_filepath.replace(/\/SPEC\.md$/, "");
  const basename = project_dir.split("/").pop() ?? "";
  const archive_dir = `${output_dir}/_archive/${basename}`;
  return {
    type: "worker",
    description: "Archives a rejected project and removes the idea from NOTES.md",
    modelTier: "light",
    permissions: "full",
    tools: ["edit", "bash"],
    timeoutSeconds: 120,
    promptContext: [{ filepath: "NOTES.md" }],
    promptTemplate: `
The project at ${project_dir} was rejected by the code reviewer. Archive it cleanly.

ORIGINAL IDEA (from SPEC creator):
${instructions}

Procedure:

1. Ensure the archive parent dir exists:
   mkdir -p ${output_dir}/_archive

2. Move the project into the archive:
   mv ${project_dir} ${archive_dir}

3. Write ${archive_dir}/REASON.md with:
   - Header: "# Why this project was archived"
   - One paragraph noting the project failed code review
   - The original idea (the text above)
   - A pointer to SPEC.md and PLAN.md inside ${archive_dir} for full context

4. Edit NOTES.md to remove the entry that matches the original idea above. If it's part of a larger note, trim only the captured portion. If no clear match, leave NOTES.md alone.

Confirm completion with a one-line summary listing what you moved and what you trimmed.`,
  };
});
