import { resolve } from "node:path";
import { findProjectRoot } from "./find-project-root.js";
import { loadRegistry, loadSingleAgentRegistry, resolveAgentName } from "./registry.js";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent-runner.js";
import { runWorkflow } from "./engine.js";
import { readMetrics, readMetricsRange, summariseMetrics } from "./metrics.js";
import { fmt, logWorkflowResult, logStreamEvent } from "./logger.js";
import { formatPrecheckReport, precheckWorkflow, validateAgentArgs } from "./precheck.js";
import { sendNotification, formatWorkflowNotification, formatAgentNotification } from "./notify.js";
import { makeRunId } from "./time.js";
import { pickPrintableFinalOutput } from "./cli/workflow-output.js";
import { parseArgs } from "./cli/parse-args.js";

async function main() {
  const args = process.argv.slice(2);
  const { positional, flags } = parseArgs(args);
  const [command, target] = positional;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h" ||
    flags.help === "true" ||
    flags.h === "true"
  ) {
    const { runHelp } = await import("./cli/help.js");
    await runHelp(target);
    return;
  }

  if (command === "init") {
    const { runInit, runBareInit } = await import("./cli/init.js");
    if (!target) {
      await runBareInit(process.cwd());
      return;
    }
    const dest = positional[2] ?? process.cwd();
    await runInit({
      spec: target,
      dest,
      skipPreflight: flags["skip-preflight"] === "true",
      skipInstall: flags["skip-install"] === "true",
      yes: flags.yes === "true",
      force: flags.force === "true",
    });
    return;
  }

  if (command === "skills" && target === "sync") {
    const { runSkillsSync } = await import("./cli/skills-sync.js");
    await runSkillsSync();
    return;
  }

  if (command === "add") {
    const { runAdd } = await import("./cli/add.js");
    if (!target) {
      console.error("Usage: generata add <template> [--force] [--dry-run] [--into <subdir>]");
      process.exit(1);
    }
    await runAdd({
      spec: target,
      force: flags.force === "true",
      dryRun: flags["dry-run"] === "true",
      into: typeof flags.into === "string" && flags.into !== "true" ? flags.into : undefined,
    });
    return;
  }

  // Commands below require an existing project (generata.config.ts in the cwd ancestry).
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const registryOpts = {
    projectRoot,
    agentsDir: config.agentsDir,
  };

  if (command === "agent") {
    if (flags.list || target === "--list") {
      const registry = await loadRegistry(registryOpts);
      console.log(fmt.bold("Available agents:"));
      for (const agent of registry.list()) {
        console.log(
          `  ${fmt.agent(agent.name.padEnd(20))} ${fmt.dim(`[${agent.type}]`)} ${agent.description}`,
        );
      }
      return;
    }
    if (!target) {
      console.error("Usage: generata agent <name> [--key value ...]");
      process.exit(1);
    }
    // Load only the target agent to reduce heap before fork()
    const registry = await loadSingleAgentRegistry(target, registryOpts);
    const [agent] = registry.list();

    if (flags.plan_name && !flags.plan_filepath) {
      const plansDir = (flags.plans_dir as string) ?? "plans";
      flags.plan_filepath = `${plansDir}/${flags.plan_name}.md`;
    }

    if ("promptTemplate" in agent) {
      const errors = validateAgentArgs(agent, flags, {
        checkProjectExists: true,
        workDir: config.workDir,
      });
      if (errors.length > 0) {
        for (const e of errors) console.error(fmt.fail(`Agent '${agent.name}' ${e}`));
        process.exit(1);
      }
    }

    const runId = makeRunId();
    const logPromptsAgent = flags["log-prompts"] === "true" || config.logPrompts;
    delete flags["log-prompts"];
    const promptLogFile = logPromptsAgent
      ? resolve(config.workDir, config.logsDir, `prompts-agent-${agent.name}-${runId}.log`)
      : undefined;

    let result: Awaited<ReturnType<typeof runAgent>>;
    try {
      result = await runAgent({
        agent,
        args: flags,
        config,
        workDir: config.workDir,
        onEvent: (event) => logStreamEvent(event),
        promptLogFile,
      });
    } catch (err) {
      await sendNotification(`❌ ${agent.name} failed: ${String(err)}`, config);
      throw err;
    }

    console.log(result.output);

    const agentUsage =
      result.metrics.cost_was_reported && config.showPricing
        ? `cost: ${fmt.cost(result.metrics.estimated_cost_usd)}`
        : `tokens: ${fmt.dim(`${Math.round((result.metrics.input_tokens + result.metrics.output_tokens) / 1000)}k`)}`;
    console.log(
      `\n${fmt.dim("[metrics]")} ${agentUsage}  time: ${fmt.duration(result.metrics.duration_ms)}${result.metrics.model ? `  ${fmt.dim(result.metrics.model)}` : ""}`,
    );

    await sendNotification(
      formatAgentNotification(agent.name, result.metrics, result.output, config.showPricing),
      config,
    );
    return;
  }

  if (command === "workflow" || command === "run") {
    if (flags.list || target === "--list") {
      const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
      console.log("Available workflows:");
      for (const wf of registry.listWorkflows()) {
        console.log(`  ${wf.name}`);
      }
      return;
    }
    if (!target) {
      console.error("Usage: generata workflow <name> [--key value ...]");
      process.exit(1);
    }
    const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
    const candidates = [...registry.workflows.keys()];
    const resolvedName = resolveAgentName(target, candidates);
    const workflow = registry.getWorkflow(resolvedName);
    const runId = makeRunId();
    const logPrompts = flags["log-prompts"] === "true" || config.logPrompts;
    delete flags["log-prompts"];
    const promptLogFile = logPrompts
      ? resolve(config.workDir, config.logsDir, `prompts-workflow-${workflow.name}-${runId}.log`)
      : undefined;
    const result = await runWorkflow(workflow, flags, config, config.workDir, promptLogFile);

    const printable = pickPrintableFinalOutput(result.steps, workflow);
    if (printable) console.log(`\n${printable}\n`);

    const models = [
      ...new Set(result.steps.flatMap((s) => (s.metrics?.model ? [s.metrics.model] : []))),
    ].join(", ");
    logWorkflowResult(
      result.workflowName,
      result.success,
      result.totalCost,
      result.durationMs,
      models || undefined,
      result.haltReason,
      result.costWasReported,
      result.totalTokens,
      config.showPricing,
    );
    await sendNotification(formatWorkflowNotification(result, config.showPricing), config);
    return;
  }

  if (command === "validate") {
    if (flags.list || flags.all || target === "--list" || target === "--all") {
      const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
      let failed = 0;
      for (const workflow of registry.listWorkflows()) {
        const profile = typeof flags.profile === "string" ? flags.profile : undefined;
        const checkFiles = flags["check-files"] === "true";
        const paramsForCheck: Record<string, unknown> = { ...flags };
        for (const p of workflow.required) if (!(p in paramsForCheck)) paramsForCheck[p] = "__stub";
        const issues = precheckWorkflow(workflow, paramsForCheck, {
          profile,
          workDir: config.workDir,
          checkFiles,
        });
        if (issues.length === 0) {
          console.log(`${fmt.bold(workflow.name)} ${fmt.dim("ok")}`);
        } else {
          failed++;
          console.error(formatPrecheckReport(workflow.name, issues));
        }
      }
      if (failed > 0) process.exit(1);
      return;
    }
    if (!target) {
      console.error("Usage: generata validate <workflow> [--check-files] [--profile P] [--key v]");
      process.exit(1);
    }
    const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
    const candidates = [...registry.workflows.keys()];
    const resolvedName = resolveAgentName(target, candidates);
    const workflow = registry.getWorkflow(resolvedName);
    const profile = typeof flags.profile === "string" ? flags.profile : undefined;
    const checkFiles = flags["check-files"] === "true";
    const issues = precheckWorkflow(workflow, flags, {
      profile,
      workDir: config.workDir,
      checkFiles,
    });
    if (issues.length === 0) {
      console.log(`${fmt.bold(`[precheck] ${workflow.name}`)} ${fmt.dim("ok")}`);
      return;
    }
    console.error(formatPrecheckReport(workflow.name, issues));
    process.exit(1);
  }

  if (command === "metrics") {
    const metricsDir = resolve(config.workDir, config.metricsDir);
    if (target === "today" || !target) {
      const records = readMetrics(metricsDir);
      const summary = summariseMetrics(records);
      const showCost = summary.cost > 0;
      console.log(fmt.bold("Today's metrics:"));
      console.log(`  Calls: ${fmt.dim(String(summary.calls))}`);
      if (showCost) {
        console.log(`  Cost:  ${fmt.cost(summary.cost)}`);
      } else {
        const totalRead = summary.input_tokens + summary.cache_read_tokens;
        const cacheHit =
          totalRead > 0 ? Math.round((summary.cache_read_tokens / totalRead) * 100) : 0;
        console.log(`  Cache hit: ${fmt.dim(`${cacheHit}%`)}`);
      }
      console.log(`  Input tokens:  ${fmt.dim(summary.input_tokens.toLocaleString())}`);
      console.log(`  Output tokens: ${fmt.dim(summary.output_tokens.toLocaleString())}`);
    } else if (target === "week") {
      const records = readMetricsRange(metricsDir, 7);
      const summary = summariseMetrics(records);
      const showCost = summary.cost > 0;
      console.log(fmt.bold("7-day metrics:"));
      console.log(`  Calls: ${fmt.dim(String(summary.calls))}`);
      if (showCost) {
        console.log(`  Cost:  ${fmt.cost(summary.cost)}`);
      } else {
        const totalRead = summary.input_tokens + summary.cache_read_tokens;
        const cacheHit =
          totalRead > 0 ? Math.round((summary.cache_read_tokens / totalRead) * 100) : 0;
        console.log(`  Cache hit: ${fmt.dim(`${cacheHit}%`)}`);
      }
      console.log(`  Input tokens:  ${fmt.dim(summary.input_tokens.toLocaleString())}`);
      console.log(`  Output tokens: ${fmt.dim(summary.output_tokens.toLocaleString())}`);
    } else if (target === "expensive") {
      const records = readMetrics(metricsDir);
      const showCost = records.some((r) => r.estimated_cost_usd > 0);
      if (showCost) {
        const sorted = records
          .sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd)
          .slice(0, 10);
        console.log(fmt.bold("Top 10 most expensive calls today:"));
        sorted.forEach((r, i) => {
          console.log(
            `  ${fmt.dim(`${i + 1}.`)} ${fmt.agent(r.agent)} ${fmt.cost(r.estimated_cost_usd)} ${fmt.dim(`(${r.duration_ms}ms)`)}`,
          );
        });
      } else {
        const sorted = records
          .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens))
          .slice(0, 10);
        console.log(fmt.bold("Top 10 heaviest calls today:"));
        sorted.forEach((r, i) => {
          const tok = r.input_tokens + r.output_tokens;
          console.log(
            `  ${fmt.dim(`${i + 1}.`)} ${fmt.agent(r.agent)} ${fmt.dim(`${Math.round(tok / 1000)}k tok`)} ${fmt.dim(`(${r.duration_ms}ms)`)}`,
          );
        });
      }
    } else if (target === "agent") {
      const agentName = positional[2];
      if (!agentName) {
        console.error(fmt.fail("Usage: generata metrics agent <name>"));
        process.exit(1);
      }
      const records = readMetricsRange(metricsDir, 7).filter((r) => r.agent === agentName);
      const summary = summariseMetrics(records);
      const showCost = summary.cost > 0;
      console.log(fmt.bold(`7-day metrics for agent '${agentName}':`));
      console.log(`  Calls: ${fmt.dim(String(summary.calls))}`);
      if (showCost) {
        console.log(`  Cost:  ${fmt.cost(summary.cost)}`);
      } else {
        const totalRead = summary.input_tokens + summary.cache_read_tokens;
        const cacheHit =
          totalRead > 0 ? Math.round((summary.cache_read_tokens / totalRead) * 100) : 0;
        console.log(`  Cache hit: ${fmt.dim(`${cacheHit}%`)}`);
      }
      console.log(`  Input tokens:  ${fmt.dim(summary.input_tokens.toLocaleString())}`);
      console.log(`  Output tokens: ${fmt.dim(summary.output_tokens.toLocaleString())}`);
      if (records.length > 0) {
        const avgDuration = records.reduce((s, r) => s + r.duration_ms, 0) / records.length;
        const failures = records.filter((r) => r.status !== "success").length;
        console.log(`  Avg duration:  ${fmt.dim(`${Math.round(avgDuration)}ms`)}`);
        console.log(`  Failures:      ${failures > 0 ? fmt.fail(String(failures)) : fmt.dim("0")}`);
      }
    }
    return;
  }

  console.error(fmt.fail(`Unknown command: ${command}`));
  console.error(fmt.dim("Usage: generata <agent|workflow|validate|metrics> [args]"));
  process.exit(1);
}

main().catch((err) => {
  console.error(fmt.fail("[error]"), err.message);
  process.exit(1);
});
