import { defineAgent } from "../../../../../src/define.js";

export default defineAgent({
  type: "worker",
  description: "registry-fixture-agent",
  modelTier: "light",
  tools: [],
  timeoutSeconds: 60,
  maxRetries: 1,
  prompt: "p",
});
