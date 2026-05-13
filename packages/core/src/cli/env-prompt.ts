import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";

export interface PromptItem {
  key: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
}

export async function promptForEnv(
  items: PromptItem[],
  existing: Record<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...existing };
  if (items.length === 0) return out;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (const item of items) {
      if (out[item.key] && out[item.key].length > 0) continue;
      const tag = item.secret ? " (secret)" : "";
      const req = item.required ? "" : " (optional, leave blank to skip)";
      const example = item.example ? ` [e.g. ${item.example}]` : "";
      const promptText = `${item.key}${tag}${req}${example}\n  ${item.description}\n  > `;
      let answer: string;
      do {
        if (item.secret) {
          stdout.write(promptText);
          const silent = new Writable({
            write(_chunk, _encoding, cb) {
              cb();
            },
          });
          const rl2 = createInterface({ input: stdin, output: silent });
          try {
            answer = (await rl2.question("")).trim();
          } finally {
            rl2.close();
          }
          stdout.write("\n");
        } else {
          answer = (await rl.question(promptText)).trim();
        }
      } while (item.required && answer.length === 0);
      if (answer.length > 0) {
        out[item.key] = answer;
      }
    }
  } finally {
    rl.close();
  }
  return out;
}

export function writeDotEnv(values: Record<string, string>, path: string): void {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    lines.push(`${k}="${escaped}"`);
  }
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
}
