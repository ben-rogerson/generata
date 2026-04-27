import { defineWorkflow } from "@generata/core";
import stub from "../stub.js";

export default defineWorkflow({
  description: "Audit the generata repo for improvements (stub).",
  steps: [
    { id: "scan", agent: stub, args: { step_id: "scan" } },
    { id: "prioritise", agent: stub, args: { step_id: "prioritise" }, dependsOn: ["scan"] },
    { id: "write", agent: stub, args: { step_id: "write" }, dependsOn: ["prioritise"] },
  ],
});
