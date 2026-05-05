import { basename, relative } from "node:path";
import pc from "picocolors";
import type { AgentMetrics, AgentStreamEvent, AgentType, WorktreeConfig } from "./schema.js";
import type { PrecheckIssue } from "./precheck.js";
import { formatPrecheckReport } from "./precheck.js";
import { fmt, agentColor } from "./logger.js";
import type { WorkflowIsolation } from "./logger.js";
import type { WorkflowResult } from "./engine.js";
import { formatTokenCount } from "./metrics.js";

export type WorkflowResultSummary = Omit<WorkflowResult, "output" | "steps"> & {
  stepCount: number;
  models?: string[];
};

export type EngineEvent =
  | {
      type: "workflow-start";
      workflow: string;
      stepCount: number;
      isolation: WorkflowIsolation;
      promptLogFile?: string;
      weeklyMetrics?: string;
    }
  | { type: "workflow-done"; workflow: string; result: WorkflowResultSummary }
  | {
      type: "step-start";
      stepIndex: number;
      stepCount: number;
      stepId: string;
      agent: string;
      agentType: AgentType;
      model: string;
    }
  | {
      type: "step-done";
      stepId: string;
      output: string;
      metrics: AgentMetrics;
      verdict?: { verdict: string; summary: string; issues: string[] };
      skipped?: boolean;
      showPricing: boolean;
    }
  | { type: "step-retry"; stepId: string; attempt: number; reason?: string }
  | {
      type: "agent-welcome";
      agent: string;
      agentType: AgentType;
      description: string;
      model: string;
      args?: Record<string, unknown>;
      promptLogFile?: string;
      weeklyMetrics?: string;
    }
  | { type: "agent-stream"; stepId: string | null; event: AgentStreamEvent }
  | { type: "halt"; stepId: string; reason: string }
  | { type: "precheck-fail"; workflow: string; issues: PrecheckIssue[] }
  | {
      type: "isolation-overridden";
      declared: "none" | WorktreeConfig;
      used: "none" | WorktreeConfig;
    };

export type EventSink = (event: EngineEvent) => void;

export const noopSink: EventSink = () => {};

function formatPromptLogPath(promptLogFile: string): string {
  const rel = relative(process.cwd(), promptLogFile);
  return rel && !rel.startsWith("..") ? rel : promptLogFile;
}

function formatIsolation(isolation: WorkflowIsolation): string {
  if (isolation.mode === "local") return "local";
  const rel = relative(process.cwd(), isolation.path);
  const display = rel && rel.length < isolation.path.length ? rel : isolation.path;
  return `worktree: ${display}`;
}

function tokeniseShell(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

function formatBinInvocation(command: string): string | null {
  const m = command.match(/\/bin\/(emit|verdict|params)\b\s*(.*)$/);
  if (!m) return null;
  const bin = m[1];
  const args = tokeniseShell(m[2]);

  if (bin === "emit") {
    if (args[0] === "--halt") return `Halted with reason: "${truncate(args[1] ?? "")}"`;
    if (args.length === 0) return "Step complete (no outputs declared)";
    const pairs: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const flag = (args[i] ?? "").replace(/^--/, "");
      const value = args[i + 1] ?? "";
      if (flag) pairs.push(`${flag}="${truncate(value, 60)}"`);
    }
    return `Outputs emitted: ${pairs.join(", ")}`;
  }

  if (bin === "verdict") {
    const v = args[0];
    if (v === "approve") return "Verdict: approve";
    if (v === "reject") {
      const summary = args[1] ?? "";
      const issueCount = Math.max(0, args.length - 2);
      const suffix = issueCount > 0 ? ` (${issueCount} issue${issueCount === 1 ? "" : "s"})` : "";
      return `Verdict: reject - "${truncate(summary)}"${suffix}`;
    }
    return `Verdict: ${args.join(" ")}`;
  }

  if (bin === "params") {
    const planName = args[0] ?? "";
    const instructions = args[1] ?? "";
    return `Plan params: ${planName} - "${truncate(instructions)}"`;
  }
  return null;
}

function formatToolDetail(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === "read" || n === "edit" || n === "write") {
    return typeof input.file_path === "string" ? basename(input.file_path) : "";
  }
  if (n === "bash") return typeof input.command === "string" ? input.command.slice(0, 120) : "";
  if (n === "glob" || n === "grep") {
    return typeof input.pattern === "string" ? input.pattern : "";
  }
  const first = Object.values(input).find((v) => typeof v === "string");
  return typeof first === "string" ? first.slice(0, 120) : "";
}

export const consoleSink: EventSink = (event) => {
  switch (event.type) {
    case "workflow-start": {
      const folder = event.workflow.includes("/")
        ? event.workflow.slice(0, event.workflow.lastIndexOf("/"))
        : "";
      const label = folder.includes("workflow") ? "" : `${pc.bold("workflow")} `;
      console.log(
        `  ${label}${pc.bold(event.workflow)} ${pc.dim(`(${event.stepCount} steps queued)`)}`,
      );
      console.log(`  ${pc.dim(formatIsolation(event.isolation))}`);
      if (event.promptLogFile) {
        console.log(`  ${pc.dim(formatPromptLogPath(event.promptLogFile))}`);
      }
      if (event.weeklyMetrics) console.log(`  ${pc.dim(event.weeklyMetrics)}`);
      console.log("");
      return;
    }
    case "step-start": {
      console.log(`${pc.dim(`[${event.stepIndex}/${event.stepCount}]`)} ${pc.white(event.stepId)}`);
      const color = agentColor(event.agentType);
      console.log(`  ${pc.dim("↳")} ${color(event.agent)} ${pc.dim(event.model)}`);
      return;
    }
    case "step-done": {
      const approved = !event.verdict || event.verdict.verdict === "approve";
      const failed = event.metrics.status !== "success";
      const ok = approved && !failed;
      const check = `${ok ? pc.green("✓") : pc.red("✗")} ${event.stepId}`;
      const totalTokens = event.metrics.input_tokens + event.metrics.output_tokens;
      const cost = event.metrics.estimated_cost_usd;
      const costStr =
        event.metrics.cost_was_reported && event.showPricing ? `$${cost.toFixed(4)} USD` : "";
      const usageStr = `${formatTokenCount(totalTokens)} tok${costStr ? ` (${costStr})` : ""}`;
      const parts = [
        `  ${check}`,
        pc.dim(`${(event.metrics.duration_ms / 1000).toFixed(1)}s`),
        usageStr,
      ];
      if (event.metrics.model) parts.push(pc.dim(event.metrics.model));
      console.log(parts.join(" "));
      if (event.verdict?.summary) console.log(`    ${pc.dim(event.verdict.summary)}`);
      return;
    }
    case "step-retry": {
      console.warn(
        `  ${pc.yellow("↺")} ${pc.yellow(event.stepId)} attempt ${event.attempt} failed, retrying...`,
      );
      return;
    }
    case "agent-welcome": {
      const extras: string[] = [pc.dim(event.model)];
      if (event.args?.plan_name) extras.push(pc.dim(`plan: ${String(event.args.plan_name)}`));
      if (event.args?.goal) extras.push(pc.dim(`goal: ${String(event.args.goal).slice(0, 60)}`));
      const color = agentColor(event.agentType);
      console.log(`  ${pc.bold(color(event.agent))} ${pc.dim(`[${event.agentType}]`)}`);
      console.log(`  ${pc.dim(event.description)}`);
      console.log(`  ${extras.join(pc.dim(" · "))}`);
      if (event.promptLogFile) {
        console.log(`  ${pc.dim(formatPromptLogPath(event.promptLogFile))}`);
      }
      if (event.weeklyMetrics) console.log(`  ${pc.dim(event.weeklyMetrics)}`);
      console.log("");
      return;
    }
    case "agent-stream": {
      const e = event.event;
      if (e.type !== "tool_use") return;
      if (e.name.toLowerCase() === "bash") {
        const cmd = typeof e.input.command === "string" ? e.input.command : "";
        const friendly = formatBinInvocation(cmd);
        if (friendly) {
          console.log(`  ${pc.dim("→")} ${pc.dim(friendly)}`);
          return;
        }
      }
      const detail = formatToolDetail(e.name, e.input);
      const detailStr = detail ? pc.dim(`: ${detail}`) : "";
      console.log(`  ${pc.dim("→")} ${pc.dim(e.name)}${detailStr}`);
      return;
    }
    case "workflow-done": {
      const r = event.result;
      const status = r.success ? pc.green("SUCCESS") : pc.red("FAILED");
      console.log(`\n${pc.bold("[workflow]")} ${event.workflow}: ${status}`);
      // showPricing is a UX concern owned by the caller of consoleSink (the CLI),
      // not the engine. The engine emits raw figures; the CLI either appends a
      // pricing line via its own onEvent or doesn't. Here we always show tokens.
      const usage = `tokens: ${pc.cyan(formatTokenCount(r.totalTokens))}`;
      const parts = [`  ${usage}  time: ${pc.dim(`${(r.durationMs / 1000).toFixed(1)}s`)}`];
      if (r.models && r.models.length > 0) parts.push(pc.dim(r.models.join(", ")));
      console.log(parts.join("  "));
      if (r.haltReason) console.log(`  ${pc.red("✗")} ${pc.dim(r.haltReason)}`);
      return;
    }
    case "halt": {
      // Stand-alone halt event isn't printed; the workflow-done summary above
      // shows haltReason. Kept on the union for programmatic subscribers.
      return;
    }
    case "precheck-fail": {
      console.error(formatPrecheckReport(event.workflow, event.issues));
      return;
    }
    case "isolation-overridden": {
      console.warn(
        `  ${fmt.warn("⚠")} isolation overridden: declared ${
          typeof event.declared === "object" ? "worktree" : event.declared
        } -> using ${typeof event.used === "object" ? "worktree" : event.used}`,
      );
      return;
    }
  }
};
