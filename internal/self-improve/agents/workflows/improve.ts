import { defineWorkflow } from "@generata/core";
import stub from "../stub.js";

export default defineWorkflow({
  description: "Pick a backlog item, plan it, ship it (stub).",
  steps: [
    { id: "pick", agent: stub, args: { step_id: "pick" } },
    { id: "spec", agent: stub, args: { step_id: "spec" }, dependsOn: ["pick"] },
    { id: "plan", agent: stub, args: { step_id: "plan" }, dependsOn: ["spec"] },
    { id: "code", agent: stub, args: { step_id: "code" }, dependsOn: ["plan"] },
    { id: "summarise", agent: stub, args: { step_id: "summarise" }, dependsOn: ["code"] },
  ],
});
