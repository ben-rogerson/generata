import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Echoes its input",
  modelTier: "light",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 10,
  envKeys: ["FAKE_KEY"],
  promptTemplate: ({ input }) => `Echo: ${input}`,
});
