import { spawn } from "child_process";
import { GlobalConfig } from "./schema.js";

export async function humanizeOutput(output: string, config: GlobalConfig): Promise<string | null> {
  const prompt = `Summarise the following agent output in plain language. 2-4 sentences. No caveats or meta-commentary - just explain what was found and what it means for the user.\n\n${output}`;
  const model = config.modelTiers.light;

  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p", prompt, "--model", model, "--output-format", "json"], {
      timeout: 30_000,
    });

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on("close", () => {
      try {
        const parsed = JSON.parse(stdout);
        resolve(typeof parsed.result === "string" ? parsed.result : null);
      } catch {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}
