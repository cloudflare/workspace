import { describe, expect, it } from "vitest";

import { summarizeParsedAnswer } from "./score-summary";

describe("score presentation", () => {
  it("summarizes oversized attempted answers", () => {
    expect(String(summarizeParsedAnswer("x".repeat(20_000))).length).toBeLessThanOrEqual(500);
  });

  it("limits long attempted lists", () => {
    const result = summarizeParsedAnswer(Array.from({ length: 100 }, () => "x".repeat(500)));
    expect(result).toHaveLength(20);
    expect((result as string[]).every((item) => item.length <= 160)).toBe(true);
  });
});
