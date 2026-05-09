// Deterministic writer: parses the feature-dreamer agent's JSON output and
// persists each dream as a markdown file in internal/ideas/, in the same
// shape the /idea skill produces. Slug-based dedupe across all dates.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Dream {
  title: string;
  kind: "big-swing" | "adjacent-extension";
  problem: string;
  openQuestions: string[];
  notes?: string;
}

export interface WriteSummary {
  written: string[];
  skipped: string[];
  rejected: string[];
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderIdeaMd(dream: Dream): string {
  const lines: string[] = [];
  lines.push(`# ${dream.title}`);
  lines.push("");
  lines.push("## Problem");
  lines.push(dream.problem);
  lines.push("");
  lines.push("## Open questions");
  for (const q of dream.openQuestions) lines.push(`- ${q}`);
  lines.push("");
  lines.push("## Notes");
  lines.push(`- kind: ${dream.kind}`);
  if (dream.notes) {
    for (const n of dream.notes.split("\n")) {
      if (n.trim()) lines.push(`- ${n.trim()}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function isValidDream(x: unknown): x is Dream {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.title !== "string" || o.title.trim() === "") return false;
  if (o.kind !== "big-swing" && o.kind !== "adjacent-extension") return false;
  if (typeof o.problem !== "string" || o.problem.trim() === "") return false;
  if (!Array.isArray(o.openQuestions) || !o.openQuestions.every((q) => typeof q === "string"))
    return false;
  if (o.notes !== undefined && typeof o.notes !== "string") return false;
  return true;
}

function dateStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function existingSlugs(ideasDir: string): Set<string> {
  if (!existsSync(ideasDir)) return new Set();
  const set = new Set<string>();
  for (const f of readdirSync(ideasDir)) {
    const m = f.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    if (m) set.add(m[1]!);
  }
  return set;
}

export function writeIdeas(json: string, ideasDir: string, now: Date = new Date()): WriteSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`dreams JSON parse failed: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`dreams JSON must be an array, got: ${typeof parsed}`);
  }

  mkdirSync(ideasDir, { recursive: true });
  const onDisk = existingSlugs(ideasDir);
  const written: string[] = [];
  const skipped: string[] = [];
  const rejected: string[] = [];
  const writtenThisRun = new Set<string>();
  const date = dateStamp(now);

  for (const entry of parsed) {
    if (!isValidDream(entry)) {
      const titleHint =
        typeof (entry as { title?: unknown })?.title === "string"
          ? (entry as { title: string }).title
          : "(unknown)";
      rejected.push(titleHint);
      continue;
    }
    const slug = slugify(entry.title);
    if (slug === "" || onDisk.has(slug) || writtenThisRun.has(slug)) {
      skipped.push(slug || entry.title);
      continue;
    }
    const filename = `${date}-${slug}.md`;
    writeFileSync(resolve(ideasDir, filename), renderIdeaMd(entry));
    written.push(filename);
    writtenThisRun.add(slug);
  }
  return { written, skipped, rejected };
}

export function formatSummary(s: WriteSummary): string {
  return `wrote ${s.written.length}, skipped ${s.skipped.length} (existing), rejected ${s.rejected.length} (invalid)`;
}
