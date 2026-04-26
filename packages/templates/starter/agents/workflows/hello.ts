import { defineWorkflow } from "@generata/core";
import greeter from "../greeter.js";

export default defineWorkflow({
  description: "Single-step workflow that greets a message",
  required: ["message"],
  steps: [{ id: "greet", agent: greeter }],
});
