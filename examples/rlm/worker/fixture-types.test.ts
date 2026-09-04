import { describe, expect, it } from "vitest";

import { scoreFixtureExecution, scoreFixtureText } from "./fixture-types";
import type { OolongSynthFixture } from "./oolong-synth";

const SYNTH_FIXTURE = {
  kind: "synth",
  manifest: {
    answerType: "ANSWER_TYPE.LABEL",
  },
  goldAnswer: "['Society & Culture', 'Entertainment & Music']",
} as OolongSynthFixture;

describe("fixture-aware scoring", () => {
  it("scores Direct Oolong-synth response formatting", () => {
    expect(scoreFixtureText(SYNTH_FIXTURE, "Label: Society & Culture")).toMatchObject({
      score: 1,
      answer: "Society & Culture",
      answerType: "string",
    });
  });

  it("formats typed Computer answers for the official synth scorer", () => {
    expect(scoreFixtureExecution(SYNTH_FIXTURE, { answer: "Society & Culture" })).toMatchObject({
      score: 1,
      attemptedParse: "Society & Culture",
    });
  });
});
