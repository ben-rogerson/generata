import { defineWorkflow } from "@generata/core";
import echo from "../echo.js";

export default defineWorkflow({
  name: "echo-flow",
  description: "One-step echo workflow",
  required: ["input"] as const,
  steps: [{ id: "echo", agent: echo }],
});
