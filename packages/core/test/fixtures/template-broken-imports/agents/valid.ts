import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "valid",
  type: "worker",
  description: "Valid sibling of the broken-imports agent",
  modelTier: "light",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 10,
  envKeys: ["VALID_KEY"],
  promptTemplate: () => "noop",
});
