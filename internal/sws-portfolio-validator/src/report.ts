// Terminal reporting for check results.

import type { CheckResult } from "./checks.js";

export function printReport(results: CheckResult[]): boolean {
  let failures = 0;
  let skips = 0;
  let lastScreen = "";
  for (const r of results) {
    if (r.screen !== lastScreen) {
      console.log(`\n■ ${r.screen}`);
      lastScreen = r.screen;
    }
    if (r.note?.startsWith("skipped")) {
      skips += 1;
      console.log(`  ○ ${r.description} — ${r.note}`);
      continue;
    }
    if (r.pass) {
      console.log(`  ✓ ${r.description}`);
    } else {
      failures += 1;
      console.log(`  ✗ ${r.description}`);
      if (r.expected !== undefined) console.log(`      expected: ${r.expected}`);
      if (r.actual !== undefined) console.log(`      actual:   ${r.actual}`);
    }
  }
  const ran = results.length - skips;
  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${ran - failures}/${ran} checks passed` +
      (skips > 0 ? ` (${skips} skipped)` : ""),
  );
  return failures === 0;
}
