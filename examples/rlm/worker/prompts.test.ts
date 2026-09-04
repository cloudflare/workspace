import { describe, expect, it } from "vitest";

import type { OolongRealFixture } from "./benchmark";
import { computerPrompt, directPrompt, directSystemPrompt } from "./prompts";

const FIXTURE = {
  manifest: {
    id: "sample-id",
    question: "What happened?",
    questionType: "generic",
    episodes: [1],
  },
  context: "LONG_PRIVATE_CONTEXT",
  chunks: ["first", "second"],
  goldAnswer: "SECRET_GOLD",
} as OolongRealFixture;

describe("benchmark prompts", () => {
  it("puts the complete context only in the Direct system prompt", () => {
    expect(directSystemPrompt(FIXTURE)).toContain(FIXTURE.context);
    expect(directPrompt(FIXTURE)).not.toContain(FIXTURE.context);
    expect(directSystemPrompt(FIXTURE)).not.toContain(FIXTURE.goldAnswer);
    expect(directPrompt(FIXTURE)).not.toContain(FIXTURE.goldAnswer);
  });

  it("keeps long context and gold out of Computer parent prompts", () => {
    for (const lane of ["executor", "rlm"] as const) {
      const prompt = computerPrompt(FIXTURE, lane);
      expect(prompt).toContain(FIXTURE.manifest.question);
      expect(prompt).toContain("2 bounded files");
      expect(prompt).not.toContain(FIXTURE.context);
      expect(prompt).not.toContain(FIXTURE.goldAnswer);
    }
  });
});
