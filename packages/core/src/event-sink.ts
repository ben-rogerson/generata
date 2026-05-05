import type {
  AgentMetrics,
  AgentStreamEvent,
  AgentType,
  WorktreeConfig,
} from "./schema.js";
import type { PrecheckIssue } from "./precheck.js";
import type { WorkflowIsolation } from "./logger.js";
import type { WorkflowResult } from "./engine.js";

export type WorkflowResultSummary = Omit<WorkflowResult, "output" | "steps"> & {
  stepCount: number;
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

// Body fleshed out in Task 4. Throwing here makes any premature use loud.
export const consoleSink: EventSink = (_event) => {
  throw new Error("consoleSink not yet implemented");
};
