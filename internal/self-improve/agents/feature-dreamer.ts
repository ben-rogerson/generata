import { defineAgent } from "@generata/core";

export default defineAgent<{ existing_titles: string }>(({ existing_titles }) => ({
  type: "worker",
  description:
    "Surfaces important new features generata could ship next; mixes big-swing and adjacent-extension ideas, emits a JSON array.",
  modelTier: "heavy",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 2400,
  promptContext: [
    { filepath: "../../README.md" },
    { filepath: "../../AGENTS.md" },
    { filepath: "NORTH-STAR.md" },
  ],
  prompt: `
You are surfacing important new features generata could ship next. Read the
README, AGENTS.md, and NORTH-STAR.md in your context. README and AGENTS.md
describe the product's current shape; NORTH-STAR.md describes where it is
heading (principles) and current areas of interest (themes). Your dreams
should ladder up to a principle and ideally land in a theme. An off-theme
dream is fine if it is a strong principle fit; an off-principle dream is
not.

Generate roughly 10 dream ideas, aiming for half big-swing and half
adjacent-extension.

Definitions:
- big-swing: paradigm-shifting, 6-12 month bets. New use cases, new audiences,
  new product modes. May feel ambitious or impractical, that is fine.
- adjacent-extension: practical, near-term, fits the existing product shape.
  New templates, new agent capabilities, new isolation modes, new flags
  whose absence stands out.

For each idea, capture:
- title: short, sentence case, <= 8 words
- kind: "big-swing" or "adjacent-extension"
- problem: 1-2 sentences naming the user/persona this unblocks and what they
  cannot do today
- openQuestions: 2-3 real "would need to validate" questions, not rhetorical
  questions. Things you'd genuinely research before committing.
- notes (optional): 1-3 short bullets joined with newlines for shaping
  context (placement, scope, prior art, etc.)

Avoid restating ideas already in the existing list below. Compare titles
case-insensitively and reject anything whose subject overlaps an existing
entry, even if the exact words differ.

Existing idea titles (already captured):
${existing_titles || "(none)"}

If after considering the inputs you genuinely cannot surface a single
non-overlapping idea, halt with reason "all dream candidates duplicate
existing ideas".
`,
  outputs: {
    dreams_json:
      'JSON-encoded array of dream features. Each entry: { "title": "<=8 words, sentence case", "kind": "big-swing" | "adjacent-extension", "problem": "<1-2 sentences>", "openQuestions": ["<question 1>", "<question 2>"], "notes": "<optional, 1-3 short bullets joined with newlines>" }. The notes key is optional - omit it entirely if absent (do not emit `null` or `""`). Aim for ~10 entries; lean closer to 8 than 12 if quality drops.',
  },
}));
