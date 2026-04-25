import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const RequiredBin = z.object({
  name: z.string(),
  hint: z.string().optional(),
  optional: z.boolean().default(false),
});

const RequiredEnvEntry = z.object({
  description: z.string(),
  example: z.string().optional(),
  secret: z.boolean().default(false),
  optional: z.boolean().default(false),
});

export const TemplateManifest = z.object({
  name: z.string(),
  description: z.string(),
  engineVersion: z.string().optional(),
  requiredBins: z.array(RequiredBin).default([]),
  requiredEnv: z.record(z.string(), RequiredEnvEntry).default({}),
  installPaths: z.record(z.string(), z.string()).default({}),
  profiles: z.array(z.string()).default([]),
  postInstall: z.string().optional(),
});
export type TemplateManifest = z.infer<typeof TemplateManifest>;

export function parseManifest(input: unknown): TemplateManifest {
  return TemplateManifest.parse(input);
}

export function loadManifest(templateDir: string): TemplateManifest {
  const path = resolve(templateDir, "generata.template.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Template manifest not found at ${path}. Every template must have a generata.template.json at its root.`,
    );
  }
  return parseManifest(JSON.parse(raw));
}
