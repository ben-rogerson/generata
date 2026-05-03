import { defineWorkflow } from "@generata/core";
import echo from "./echo.js";

export default defineWorkflow({
  description: "One-step echo workflow",
  required: ["input"] as const,
})
  .step("echo", echo)
  .build();
