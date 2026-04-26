import { defineWorkflow } from "@generata/core";
import echo from "../echo.js";

export default defineWorkflow({
  description: "Single-step workflow that calls the echo agent with a message",
  required: ["message"],
  steps: [{ id: "echo", agent: echo }],
});
