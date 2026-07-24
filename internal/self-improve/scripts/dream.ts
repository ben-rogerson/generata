// Programmatic dreamer driver. Mirrors audit.ts: collect inputs
// deterministically, call runAgent on a single agent, persist outputs via
// a deterministic writer.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, runScript } from "@generata/core";
import config from "../generata.config.js";
import featureDreamer from "../agents/feature-dreamer.js";
import { writeIdeas, formatSummary } from "./write-ideas.js";

function asStringArgs(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)]));
}

function collectExistingTitles(ideasDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(ideasDir);
  } catch {
    return [];
  }
  const titles: string[] = [];
  for (const f of entries) {
    if (!f.endsWith(".md")) continue;
    try {
      const first = readFileSync(resolve(ideasDir, f), "utf8").split("\n")[0] ?? "";
      const t = first.replace(/^#\s+/, "").trim();
      if (t) titles.push(t);
    } catch {
      // Unreadable file - skip; not fatal for the dream run.
    }
  }
  return titles;
}

await runScript(async ({ signal }) => {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const ideasDir = resolve(scriptDir, "../../ideas");

  console.log("→ collecting existing idea titles");
  const existing = collectExistingTitles(ideasDir);

  console.log(`→ dreaming (${existing.length} existing titles to avoid)`);
  // Render titles as bulleted lines so the agent reads them as a list,
  // not a wall of text.
  const titlesBlock = existing.map((t) => `- ${t}`).join("\n");
  const inv = featureDreamer({ existing_titles: titlesBlock });
  const ran = await runAgent(inv.agent, asStringArgs(inv.args), { config, signal });
  if (ran.halt) {
    throw new Error(`feature-dreamer halted: ${ran.halt.reason}`);
  }
  const dreamsJson = ran.outputs?.dreams_json;
  if (!dreamsJson) {
    throw new Error("feature-dreamer produced no dreams_json output");
  }

  console.log("→ writing ideas");
  const summary = writeIdeas(dreamsJson, ideasDir);
  console.log(formatSummary(summary));
  if (summary.written.length > 0) {
    for (const f of summary.written) console.log(`  + ${f}`);
  }
});
