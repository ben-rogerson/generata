import { defineAgent } from "@generata/core";

export default defineAgent<{ message: string }>(({ message }) => ({
  type: "worker",
  description: "Greets a message in any creative one-line form - haiku, pun, fortune, whatever fits.",
  modelTier: "light",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 30,
  prompt: `
Greet "${message}" in any creative one-line form you like - a haiku, a pun, a fortune-cookie line, an aphorism, whatever feels right. Pick a different style each time you're called. One line only, no preamble, no explanation.
`,
}));
