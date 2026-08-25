import { describe, expect, it } from "vitest";

import { extractExecutionResult, extractGeneratedSourceBytes } from "./executor-tool";
import { completeInference, emptyRunMetrics, startInference, withCombinedMetrics } from "./metrics";

describe("execution and usage accounting", () => {
  it("extracts typed results and generated source bytes", () => {
    expect(
      extractExecutionResult([{ toolName: "executor", output: { result: { answer: 42 } } }]),
    ).toMatchObject({ found: true, value: { answer: 42 } });
    expect(
      extractGeneratedSourceBytes([
        { toolName: "executor", input: { command: "export default () => 42" } },
      ]),
    ).toBeGreaterThan(0);
  });

  it("keeps parent, child, and combined provider usage separate", () => {
    let metrics = emptyRunMetrics();
    metrics = {
      ...metrics,
      parent: completeInference(startInference(metrics.parent), {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      }),
      children: completeInference(startInference(metrics.children), {
        inputTokens: 300,
        outputTokens: 40,
        totalTokens: 340,
      }),
    };
    metrics = withCombinedMetrics(metrics);
    expect(metrics.parent.totalTokens).toBe(120);
    expect(metrics.children.totalTokens).toBe(340);
    expect(metrics.combined.totalTokens).toBe(460);
    expect(metrics.combined.completedCalls).toBe(2);
  });
});
