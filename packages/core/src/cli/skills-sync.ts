import { join } from "node:path";
import { findProjectRoot } from "../find-project-root.js";
import { loadConfig } from "../config.js";
import { loadRegistry } from "../registry.js";
import { generateSlashCommands } from "./slash-commands.js";
import { fmt } from "../logger.js";

export async function runSkillsSync(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
  const workflows = registry.listWorkflows();
  const dest = join(projectRoot, ".claude", "commands");
  generateSlashCommands({ workflows, destDir: dest });
  console.log(fmt.dim(`Wrote ${workflows.length} slash commands to ${dest}`));
}
