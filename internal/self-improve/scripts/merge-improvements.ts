// Deterministic merge: prioritiser findings -> IMPROVEMENTS.md.
// Skips findings that match an existing entry (slug equals OR
// any evidence path overlaps); updates score in-place when
// matched; appends genuinely new entries. Never rewrites
// existing entry bodies, so the LLM cannot accidentally
// truncate the backlog.
//
// Exposes `mergeImprovements(rankedJson, opts)` for programmatic use; the
// CLI shim at the bottom is kept for ad-hoc invocation but is no longer on
// the audit hot path.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface MergeSummary {
  added: number;
  updated: number;
  skipped: number;
}

interface Finding {
  lens: string;
  title: string;
  description: string;
  evidence_paths: string[];
  suggested_change_kind: string;
  impact: number;
  effort: number;
  score: number;
  reasoning: string;
}

interface ExistingEntry {
  slug: string;
  lens: string;
  score: number;
  evidencePaths: string[];
  raw: string;
  headerLine: string;
}

function deriveSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripLineSuffix(p: string): string {
  return p.trim().replace(/:\d+(?:-\d+)?$/, "");
}

function parsePrioritiser(raw: string): Finding[] {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  let parsed: unknown;
  if (fence) {
    parsed = JSON.parse(fence[1]!);
  } else {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("no JSON found in prioritiser output");
    }
    parsed = JSON.parse(raw.slice(start, end + 1));
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { ranked?: unknown }).ranked)
  ) {
    throw new Error("prioritiser output missing 'ranked' array");
  }
  return (parsed as { ranked: Finding[] }).ranked;
}

function parseExisting(content: string): { header: string; entries: ExistingEntry[] } {
  const headerEnd = content.search(/^### /m);
  if (headerEnd === -1) {
    return { header: content, entries: [] };
  }
  const header = content.slice(0, headerEnd);
  const body = content.slice(headerEnd);
  const re = /^### ([a-z0-9-]+) \[([a-z-]+) · score (\d+)\]/gm;
  const entries: ExistingEntry[] = [];
  const matches = [...body.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : body.length;
    const raw = body.slice(start, end);
    const evMatch = raw.match(/^- \*\*Evidence:\*\* (.+)$/m);
    const evidencePaths = evMatch
      ? evMatch[1]!.split(",").map(stripLineSuffix).filter(Boolean)
      : [];
    entries.push({
      slug: m[1]!,
      lens: m[2]!,
      score: Number(m[3]!),
      evidencePaths,
      raw,
      headerLine: m[0]!,
    });
  }
  return { header, entries };
}

function renderEntry(finding: Finding, slug: string): string {
  return (
    `### ${slug} [${finding.lens} · score ${finding.score}]\n` +
    `\n` +
    `${finding.description}\n` +
    `\n` +
    `- **Evidence:** ${finding.evidence_paths.join(", ")}\n` +
    `- **Suggested change:** ${finding.suggested_change_kind}\n` +
    `\n` +
    `---\n\n`
  );
}

function defaultTargetPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "IMPROVEMENTS.md");
}

export function mergeImprovements(
  rankedJson: string,
  opts: { targetPath?: string } = {},
): MergeSummary {
  const targetPath = opts.targetPath ?? defaultTargetPath();
  const findings = parsePrioritiser(rankedJson);
  const fileContent = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";
  const { header, entries } = parseExisting(fileContent);

  const slugIndex = new Map(entries.map((e) => [e.slug, e]));
  const updates = new Map<string, ExistingEntry>();
  const newBlocks: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const f of findings) {
    const slug = deriveSlug(f.title);
    const fpaths = f.evidence_paths.map(stripLineSuffix);

    let match = slugIndex.get(slug);
    if (!match) {
      match = entries.find((e) => e.evidencePaths.some((ep) => fpaths.includes(ep)));
    }

    if (match) {
      if (match.score !== f.score) {
        const newHeader = `### ${match.slug} [${match.lens} · score ${f.score}]`;
        updates.set(match.slug, {
          ...match,
          score: f.score,
          raw: match.raw.replace(match.headerLine, newHeader),
        });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    newBlocks.push(renderEntry(f, slug));
    added++;
  }

  if (added === 0 && updated === 0) {
    return { added, updated, skipped };
  }

  let out = header;
  for (const e of entries) {
    out += (updates.get(e.slug) ?? e).raw;
  }
  if (newBlocks.length) {
    if (!out.endsWith("\n")) out += "\n";
    out += newBlocks.join("");
  }

  writeFileSync(targetPath, out);
  return { added, updated, skipped };
}

export function formatSummary(s: MergeSummary): string {
  return `Added ${s.added} new entries; updated ${s.updated} scores; skipped ${s.skipped} duplicates.`;
}

// CLI shim - kept so the file is still ad-hoc runnable, though the audit
// pipeline now calls `mergeImprovements()` directly.
function isMainModule(): boolean {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const inputFile = process.argv[2];
  const targetOverride = process.argv[3];
  if (!inputFile) {
    console.error("Usage: merge-improvements.ts <prioritiser-output> [<improvements-md>]");
    process.exit(2);
  }
  try {
    const summary = mergeImprovements(readFileSync(inputFile, "utf-8"), {
      targetPath: targetOverride,
    });
    console.log(formatSummary(summary));
  } catch (err) {
    console.error(`ERROR: ${(err as Error).message}`);
    process.exit(1);
  }
}
