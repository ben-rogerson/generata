import { defineWorkflow } from "../../../../../src/define.js";
import agent from "../sub/registry-agent.js";

export default defineWorkflow({ description: "registry-fixture-wf" }).step("only", agent).build();
