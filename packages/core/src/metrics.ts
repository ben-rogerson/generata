import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { AgentMetrics } from "./schema.js";

function getMetricsPath(metricsDir: string, date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return resolve(metricsDir, `${d}.jsonl`);
}

export function writeMetrics(metrics: AgentMetrics, metricsDir: string): void {
  mkdirSync(resolve(metricsDir), { recursive: true });
  const path = getMetricsPath(metricsDir);
  appendFileSync(path, JSON.stringify(metrics) + "\n", "utf-8");
}

export function readMetrics(metricsDir: string, date?: string): AgentMetrics[] {
  const path = getMetricsPath(metricsDir, date);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AgentMetrics);
}

export function readMetricsRange(metricsDir: string, days: number, offsetDays = 0): AgentMetrics[] {
  const results: AgentMetrics[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i - offsetDays);
    const date = d.toISOString().slice(0, 10);
    results.push(...readMetrics(metricsDir, date));
  }
  return results;
}

export function summariseMetrics(records: AgentMetrics[]) {
  const total = records.reduce(
    (acc, r) => ({
      calls: acc.calls + 1,
      cost: acc.cost + r.estimated_cost_usd,
      input_tokens: acc.input_tokens + r.input_tokens,
      output_tokens: acc.output_tokens + r.output_tokens,
      cache_read_tokens: acc.cache_read_tokens + r.cache_read_tokens,
      duration_ms: acc.duration_ms + r.duration_ms,
    }),
    { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, duration_ms: 0 },
  );
  return total;
}

function formatDelta(current: number, previous: number): string {
  if (previous <= 0) return "";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (Math.abs(pct) < 5) return "";
  const sign = pct > 0 ? "+" : "";
  return ` ${sign}${pct}%`;
}

export function formatWeeklySummary(
  summary: ReturnType<typeof summariseMetrics>,
  showPricing: boolean,
  previous?: ReturnType<typeof summariseMetrics>,
): string | undefined {
  if (summary.calls === 0) return undefined;
  const totalTokens = summary.input_tokens + summary.output_tokens;
  const prevTokens = previous ? previous.input_tokens + previous.output_tokens : 0;
  const callsSegment = `${summary.calls} calls${previous ? formatDelta(summary.calls, previous.calls) : ""}`;
  const tokSegment = `${Math.round(totalTokens / 1000)}k tok${previous ? formatDelta(totalTokens, prevTokens) : ""}`;
  const parts = ["7d", callsSegment];
  if (showPricing && summary.cost > 0) parts.push(`$${summary.cost.toFixed(2)}`);
  parts.push(tokSegment);
  return parts.join(" · ");
}

export function formatWeeklyMetricsLine(
  metricsDir: string,
  showPricing: boolean,
): string | undefined {
  const current = summariseMetrics(readMetricsRange(metricsDir, 7));
  const previous = summariseMetrics(readMetricsRange(metricsDir, 7, 7));
  return formatWeeklySummary(current, showPricing, previous);
}
