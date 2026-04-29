import { execSync } from "child_process";
import { GlobalConfig, AgentMetrics } from "./schema.js";
import type { WorkflowResult } from "./engine.js";

export function formatWorkflowNotification(result: WorkflowResult, showPricing: boolean): string {
  const icon = result.success ? "✅" : "❌";
  const usage =
    result.costWasReported && showPricing
      ? `$${result.totalCost.toFixed(4)}`
      : `${Math.round(result.totalTokens / 1000)}k tok`;
  const header = `${icon} ${result.workflowName} (${usage}, ${(result.durationMs / 1000).toFixed(1)}s)`;
  const steps = result.steps
    .map((s) => {
      if (s.skipped) return `⊘ ${s.stepId}`;
      if (s.metrics?.status === "failure") return `✗ ${s.stepId}: ${s.metrics.error ?? "failed"}`;
      return `✓ ${s.stepId}`;
    })
    .join("  ");
  return `${header}\n  ${steps}`;
}

export function formatAgentNotification(
  name: string,
  metrics: AgentMetrics,
  output: string | undefined,
  showPricing: boolean,
): string {
  const icon = metrics.status === "success" ? "✅" : "❌";
  const detail = metrics.status !== "success" && metrics.error ? `: ${metrics.error}` : "";
  const usage =
    metrics.cost_was_reported && showPricing
      ? `$${metrics.estimated_cost_usd.toFixed(4)}`
      : `${Math.round((metrics.input_tokens + metrics.output_tokens) / 1000)}k tok`;
  const header = `${icon} ${name} (${usage}, ${(metrics.duration_ms / 1000).toFixed(1)}s)${detail}`;
  if (!output) return header;
  const snippet = output.trim().split("\n")[0].slice(0, 200);
  return `${header}\n  ${snippet}`;
}

function sendMacOSNotification(message: string): void {
  if (process.platform !== "darwin") return;
  // single-line title + first line as subtitle for cleaner display
  const [title, ...rest] = message.split("\n");
  const subtitle = rest.join(" ").trim();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    execSync("which terminal-notifier", { stdio: "ignore" });
    const args = [
      `-title "Generata"`,
      `-message "${esc(title)}"`,
      subtitle ? `-subtitle "${esc(subtitle)}"` : "",
      `-sticky`,
      `-group generata`,
    ]
      .filter(Boolean)
      .join(" ");
    execSync(`terminal-notifier ${args}`, { stdio: "ignore" });
  } catch {
    // terminal-notifier not available - fall back to osascript banner
    try {
      const osa = subtitle
        ? `display notification "${esc(subtitle)}" with title "Generata" subtitle "${esc(title)}"`
        : `display notification "${esc(title)}" with title "Generata"`;
      execSync(`osascript -e '${osa}'`, { stdio: "ignore" });
    } catch {
      // non-fatal
    }
  }
}

export async function sendNotification(message: string, config: GlobalConfig): Promise<void> {
  if (!config.notifications) return;
  sendMacOSNotification(message);

  if (!config.telegram?.botToken || !config.telegram.chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch {
    // non-fatal
  }
}
