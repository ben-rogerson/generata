import { defineAgent, defineWorkflow } from "../../../src/define.js";

export const fixtureAgent = defineAgent({
  type: "worker",
  description: "fixture",
  modelTier: "light",
  tools: [],
  timeoutSeconds: 60,
  maxRetries: 1,
  prompt: "p",
});

export const fixtureFactoryAgent = defineAgent<{ x: string }>(({ x }) => ({
  type: "worker",
  description: "fixture-factory",
  modelTier: "light",
  tools: [],
  timeoutSeconds: 60,
  maxRetries: 1,
  prompt: `x=${x}`,
}));

export const fixtureWorkflow = defineWorkflow({ description: "fixture-wf" })
  .step("only", fixtureAgent)
  .build();
