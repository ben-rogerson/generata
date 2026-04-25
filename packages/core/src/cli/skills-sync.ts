import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { findProjectRoot } from "../find-project-root.js";
import { loadConfig } from "../config.js";
import { loadTs } from "../ts-loader.js";
import { generateSlashCommands } from "./slash-commands.js";
import { fmt } from "../logger.js";
import type { WorkflowDef } from "../define.js";

export async function runSkillsSync(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const workflowsAbs = resolve(projectRoot, config.workflowsDir);

  if (!existsSync(workflowsAbs)) {
    console.error(fmt.fail(`No workflow directory at ${workflowsAbs}`));
    process.exit(1);
  }

  const workflows: WorkflowDef[] = [];
  for (const entry of readdirSync(workflowsAbs, { withFileTypes: true })) {
    if (!entry.isFile() || (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js"))) continue;
    const mod = await loadTs<{ default: WorkflowDef }>(
      join(workflowsAbs, entry.name),
      import.meta.url,
    );
    if (mod.default?.name) workflows.push(mod.default);
  }

  const dest = join(projectRoot, ".claude", "commands");
  generateSlashCommands({ workflows, destDir: dest });
  console.log(fmt.dim(`Wrote ${workflows.length} slash commands to ${dest}`));
}
