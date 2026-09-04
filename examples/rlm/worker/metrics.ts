import type { LanguageModelUsage } from "ai";

import type { InferenceUsage, RunMetrics, TokenUsage } from "../shared/types";

export function emptyTokenUsage(): TokenUsage {
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

export function emptyInferenceUsage(): InferenceUsage {
  return {
    ...emptyTokenUsage(),
    attemptedCalls: 0,
    completedCalls: 0,
    accountedCalls: 0,
    inputTokensExact: true,
    outputTokensExact: true,
    totalTokensExact: true,
  };
}

export function emptyRunMetrics(): RunMetrics {
  return {
    parent: emptyInferenceUsage(),
    children: emptyInferenceUsage(),
    combined: emptyInferenceUsage(),
    durationMs: null,
    executionAttempts: 0,
    generatedSourceBytes: 0,
    executionResultBytes: 0,
  };
}

export function startInference(usage: InferenceUsage): InferenceUsage {
  return { ...usage, attemptedCalls: usage.attemptedCalls + 1 };
}

export function completeInference(
  current: InferenceUsage,
  usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">,
): InferenceUsage {
  const completed = addInferenceUsage(current, usage, true);
  // Parent model steps are sequential. Normalize duplicate start notifications
  // to the number of provider calls with reported usage.
  return { ...completed, attemptedCalls: completed.accountedCalls };
}

export function addInferenceUsage(
  current: InferenceUsage,
  usage: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null },
  completed: boolean,
): InferenceUsage {
  const input = addField(current.inputTokens, current.inputTokensExact, usage.inputTokens);
  const output = addField(current.outputTokens, current.outputTokensExact, usage.outputTokens);
  const total = addField(current.totalTokens, current.totalTokensExact, usage.totalTokens);
  return {
    attemptedCalls: current.attemptedCalls,
    completedCalls: current.completedCalls + (completed ? 1 : 0),
    accountedCalls: current.accountedCalls + 1,
    inputTokens: input.value,
    outputTokens: output.value,
    totalTokens: total.value,
    inputTokensExact: input.exact,
    outputTokensExact: output.exact,
    totalTokensExact: total.exact,
  };
}

export function withCombinedMetrics(metrics: RunMetrics): RunMetrics {
  const input = combineField(metrics.parent, metrics.children, "inputTokens", "inputTokensExact");
  const output = combineField(
    metrics.parent,
    metrics.children,
    "outputTokens",
    "outputTokensExact",
  );
  const total = combineField(metrics.parent, metrics.children, "totalTokens", "totalTokensExact");
  return {
    ...metrics,
    combined: {
      attemptedCalls: metrics.parent.attemptedCalls + metrics.children.attemptedCalls,
      completedCalls: metrics.parent.completedCalls + metrics.children.completedCalls,
      accountedCalls: metrics.parent.accountedCalls + metrics.children.accountedCalls,
      inputTokens: input.value,
      outputTokens: output.value,
      totalTokens: total.value,
      inputTokensExact: input.exact,
      outputTokensExact: output.exact,
      totalTokensExact: total.exact,
    },
  };
}

export function byteLength(value: unknown): number {
  const encoded = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(encoded ?? "").byteLength;
}

function addField(
  current: number | null,
  exactSoFar: boolean,
  next: number | undefined | null,
): { value: number | null; exact: boolean } {
  const exact = exactSoFar && next != null;
  return { value: exact ? (current ?? 0) + next : null, exact };
}

function combineField(
  parent: InferenceUsage,
  children: InferenceUsage,
  valueKey: "inputTokens" | "outputTokens" | "totalTokens",
  exactKey: "inputTokensExact" | "outputTokensExact" | "totalTokensExact",
): { value: number | null; exact: boolean } {
  const contributing = [parent, children].filter((usage) => usage.attemptedCalls > 0);
  if (contributing.length === 0) return { value: null, exact: true };
  const exact = contributing.every(
    (usage) => usage.accountedCalls === usage.attemptedCalls && usage[exactKey],
  );
  if (!exact) return { value: null, exact: false };
  return {
    value: contributing.reduce((sum, usage) => sum + (usage[valueKey] ?? 0), 0),
    exact: true,
  };
}
