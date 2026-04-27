import { defineConfig } from "@generata/core";

export default defineConfig({
  modelTiers: {
    heavy: "claude-opus-4-7",
    standard: "claude-sonnet-4-6",
    light: "claude-haiku-4-5",
  },
});
