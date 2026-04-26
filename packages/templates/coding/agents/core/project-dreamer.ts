import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "planner",
  permissions: "read-only",
  description:
    "Reads context files and existing projects, picks the most compelling next build, emits workflow params",
  modelTier: "standard",
  tools: ["read", "glob", "grep"],
  promptContext: [{ filepath: "goals.md" }, { filepath: "notes.md" }],
  timeoutSeconds: 120,
  promptTemplate: ({ plans_dir }) => `
You are deciding what to build next.

Scan queued plans:
- Glob ${plans_dir}/*.md to see plans that are queued but not yet started
- Read any queued plans to understand what's been scoped

Then pick the single most compelling next project that:
- Has not already been built
- Advances the goals in goals.md
- Is scoped to complete in one focused build cycle (not a platform, not a rewrite)
- Has a concrete, testable outcome

Reason briefly about your choice, then call the params script as your final action.
The plan_name must be a short kebab-case slug (e.g. "rate-limiter-api").
The instructions should be 2-4 sentences describing what to build and the key acceptance criteria.`,
});
