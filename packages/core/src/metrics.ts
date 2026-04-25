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

export function readMetricsRange(metricsDir: string, days: number): AgentMetrics[] {
  const results: AgentMetrics[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
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
