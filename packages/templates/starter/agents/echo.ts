import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Repeats whatever message it receives. Replace with your own agent.",
  modelTier: "light",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 30,
  promptTemplate: ({ message }) => `
Repeat the following message back, exactly as given:

${message}
`,
});
