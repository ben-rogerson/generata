import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Stub agent - prints its step id and exits. For wiring smoke tests only.",
  modelTier: "light",
  permissions: "read-only",
  tools: [],
  promptTemplate: ({ step_id }) => `Print exactly: STUB ${step_id}\nThen stop.`,
});
