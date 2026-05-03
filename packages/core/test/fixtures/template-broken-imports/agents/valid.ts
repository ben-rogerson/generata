// Intentionally bypasses `defineAgent` so the scan can read envKeys without
// needing to resolve `@generata/core` from the destination dir.
export default {
  kind: "agent",
  type: "worker",
  description: "Valid sibling of the broken-imports agent",
  modelTier: "light",
  tools: [],
  permissions: "read-only",
  timeoutSeconds: 10,
  envKeys: ["VALID_KEY"],
  prompt: () => "noop",
};
