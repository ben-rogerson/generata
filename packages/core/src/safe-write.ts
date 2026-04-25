import { writeFileSync, renameSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

export function safeWrite(targetPath: string, content: string): void {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp-${randomBytes(8).toString("hex")}`);
  try {
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      writeFileSync(tmpPath, "");
    } catch {}
    throw err;
  }
}
