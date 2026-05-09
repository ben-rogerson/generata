// Read IMPROVEMENTS.md, sort entries (unscored first, then by score desc),
// write back. Pure TS - no LLM, no JSON. Used as the final pass of `audit`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Entry {
  slug: string;
  lens: string;
  score: number | null;
  raw: string;
}

const HEADER_RE = /^### ([a-z0-9-]+) \[([a-z-]+)(?: · score (\d+))?\]/gm;

export function parseImprovements(content: string): { header: string; entries: Entry[] } {
  const headerEnd = content.search(/^### /m);
  if (headerEnd === -1) {
    return { header: content, entries: [] };
  }
  const preamble = content.slice(0, headerEnd);
  const body = content.slice(headerEnd);
  const matches = [...body.matchAll(HEADER_RE)];
  const entries: Entry[] = matches.map((m, i) => {
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : body.length;
    let raw = body.slice(start, end);
    if (!raw.endsWith("\n\n")) raw = raw.replace(/\n*$/, "\n\n");
    return {
      slug: m[1]!,
      lens: m[2]!,
      score: m[3] ? Number(m[3]) : null,
      raw,
    };
  });
  return { header: preamble, entries };
}

export interface SortSummary {
  total: number;
  scored: number;
  unscored: number;
}

export function sortImprovements(targetPath?: string): SortSummary {
  const path =
    targetPath ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "IMPROVEMENTS.md");
  if (!existsSync(path)) {
    return { total: 0, scored: 0, unscored: 0 };
  }
  const content = readFileSync(path, "utf-8");
  const { header, entries } = parseImprovements(content);
  if (entries.length === 0) {
    return { total: 0, scored: 0, unscored: 0 };
  }

  const indexed = entries.map((e, i) => ({ ...e, original: i }));
  indexed.sort((a, b) => {
    const aUnscored = a.score === null;
    const bUnscored = b.score === null;
    if (aUnscored !== bUnscored) return aUnscored ? -1 : 1;
    if (!aUnscored && !bUnscored && a.score !== b.score) return b.score! - a.score!;
    return a.original - b.original;
  });

  const out = header + indexed.map((e) => e.raw).join("");
  writeFileSync(path, out);

  return {
    total: entries.length,
    scored: entries.filter((e) => e.score !== null).length,
    unscored: entries.filter((e) => e.score === null).length,
  };
}

export function formatSortSummary(s: SortSummary): string {
  return `Sorted ${s.total} entries (${s.scored} scored, ${s.unscored} unscored).`;
}
