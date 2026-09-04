import { describe, expect, it } from "vitest";

import { DEVELOPMENT_BENCHMARK_CASES } from "./benchmark-suite";

describe("development benchmark manifest", () => {
  it("pins unique official rows and complete source hashes", () => {
    expect(DEVELOPMENT_BENCHMARK_CASES).toHaveLength(8);
    expect(new Set(DEVELOPMENT_BENCHMARK_CASES.map((item) => item.id)).size).toBe(8);
    expect(
      DEVELOPMENT_BENCHMARK_CASES.every((item) => /^fnv1a-[0-9a-f]{8}$/.test(item.sourceHash)),
    ).toBe(true);
  });

  it("separates strategy development cases from a future release set", () => {
    expect(DEVELOPMENT_BENCHMARK_CASES.every((item) => item.role === "development")).toBe(true);
    expect(
      DEVELOPMENT_BENCHMARK_CASES.some((item) => item.dataset === "oolongbench/oolong-real"),
    ).toBe(true);
    expect(
      DEVELOPMENT_BENCHMARK_CASES.some((item) => item.dataset === "oolongbench/oolong-synth"),
    ).toBe(true);
  });

  it("contains no gold answers or raw contexts", () => {
    const serialized = JSON.stringify(DEVELOPMENT_BENCHMARK_CASES);
    expect(serialized).not.toContain("goldAnswer");
    expect(serialized).not.toContain("context_window_text");
  });
});
