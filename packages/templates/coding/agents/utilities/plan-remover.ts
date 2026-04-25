import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "plan-remover",
  type: "worker",
  description: "Removes a rejected plan file from the plans directory",
  modelTier: "light",
  tools: ["bash"],
  permissions: "full",
  timeoutSeconds: 30,
  promptTemplate: ({ plan_name, plans_dir }) => `
The plan "${plan_name}" was rejected. Delete it.

Run: rm -f ${plans_dir}/${plan_name}.md

Confirm it's gone.`,
});
