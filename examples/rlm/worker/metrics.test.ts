import { describe, expect, it } from "vitest";

import {
  addInferenceUsage,
  completeInference,
  emptyInferenceUsage,
  emptyRunMetrics,
  startInference,
  withCombinedMetrics,
} from "./metrics";

describe("provider usage accounting", () => {
  it("keeps an aggregate unknown after any call omits usage", () => {
    let usage = startInference(emptyInferenceUsage());
    usage = addInferenceUsage(
      usage,
      { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      true,
    );
    usage = startInference(usage);
    usage = addInferenceUsage(
      usage,
      { inputTokens: null, outputTokens: null, totalTokens: null },
      true,
    );

    expect(usage).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      inputTokensExact: false,
      outputTokensExact: false,
      totalTokensExact: false,
    });
  });

  it("does not recover an unknown aggregate when a later call reports usage", () => {
    let usage = startInference(emptyInferenceUsage());
    usage = addInferenceUsage(usage, {}, false);
    usage = startInference(usage);
    usage = addInferenceUsage(
      usage,
      { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      true,
    );

    expect(usage.totalTokens).toBeNull();
    expect(usage.totalTokensExact).toBe(false);
  });

  it("normalizes duplicate parent starts when provider usage completes", () => {
    const started = startInference(startInference(emptyInferenceUsage()));
    const completed = completeInference(started, {
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110,
    });

    expect(completed).toMatchObject({ attemptedCalls: 1, accountedCalls: 1, totalTokens: 110 });
  });

  it("reports an unaccounted in-flight or failed provider call as unknown", () => {
    const metrics = {
      ...emptyRunMetrics(),
      parent: startInference(emptyInferenceUsage()),
    };

    expect(withCombinedMetrics(metrics).combined).toMatchObject({
      totalTokens: null,
      totalTokensExact: false,
    });
  });

  it("ignores a zero-call lane but makes combined usage unknown for an unknown contributing lane", () => {
    let metrics = emptyRunMetrics();
    metrics = {
      ...metrics,
      parent: addInferenceUsage(
        startInference(metrics.parent),
        { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
        true,
      ),
    };
    expect(withCombinedMetrics(metrics).combined.totalTokens).toBe(110);

    metrics = {
      ...metrics,
      children: addInferenceUsage(startInference(metrics.children), {}, false),
    };
    expect(withCombinedMetrics(metrics).combined).toMatchObject({
      totalTokens: null,
      totalTokensExact: false,
    });
  });
});
