import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Removes the just-built idea from NOTES.md (success path only)",
  modelTier: "light",
  permissions: "full",
  tools: ["edit"],
  timeoutSeconds: 120,
  promptContext: [{ filepath: "NOTES.md" }],
  promptTemplate: ({ instructions }) => `
The project was built and reviewed successfully. The original idea was:

${instructions}

Read NOTES.md and find the entry that corresponds to this idea.

For the matched note:
- If it's a standalone item, remove the entire entry from NOTES.md
- If it's part of a larger note, trim only the captured portion

Use the edit tool to make targeted changes. Do not rewrite the whole file.

Leave any unrelated notes untouched. If you cannot find a clear match, do nothing.`,
});
