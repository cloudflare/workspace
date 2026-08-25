import type { OolongSampleMetadata, OolongScore } from "../shared/types";
import {
  type OolongRealFixture,
  sampleMetadata as realSampleMetadata,
  scoreExecutionValue as scoreRealExecutionValue,
  scoreTextResponse as scoreRealTextResponse,
} from "./benchmark";
import {
  OOLONG_SYNTH_CONFIG,
  OOLONG_SYNTH_DATASET,
  OOLONG_SYNTH_DATASET_REVISION,
  OOLONG_SYNTH_SPLIT,
  type OolongSynthFixture,
  scoreOolongSynthResponse,
} from "./oolong-synth";

export type BenchmarkFixture = OolongRealFixture | OolongSynthFixture;

export function fixtureSampleMetadata(fixture: BenchmarkFixture): OolongSampleMetadata {
  if (fixture.kind === "real") return realSampleMetadata(fixture);
  return {
    dataset: OOLONG_SYNTH_DATASET,
    datasetRevision: OOLONG_SYNTH_DATASET_REVISION,
    config: OOLONG_SYNTH_CONFIG,
    split: OOLONG_SYNTH_SPLIT,
    row: fixture.manifest.rowIndex,
    id: fixture.manifest.id,
    contextWindowId: fixture.manifest.contextWindowId,
    questionType: fixture.manifest.questionType,
    question: fixture.manifest.question,
    contextBytes: fixture.manifest.contextBytes,
    contextHash: fixture.contextHash,
    chunkCount: fixture.chunks.length,
  };
}

export function scoreFixtureText(fixture: BenchmarkFixture, text: string): OolongScore {
  if (fixture.kind === "real") return scoreRealTextResponse(fixture.goldAnswer, text);
  return synthScore(fixture, text);
}

export function scoreFixtureExecution(fixture: BenchmarkFixture, value: unknown): OolongScore {
  if (fixture.kind === "real") return scoreRealExecutionValue(fixture.goldAnswer, value);
  const candidate = isRecord(value) && Object.hasOwn(value, "answer") ? value.answer : value;
  const answer = Array.isArray(candidate) ? candidate.join(", ") : String(candidate ?? "");
  return synthScore(fixture, `${answerPrefix(fixture.manifest.answerType)}: ${answer}`);
}

function synthScore(fixture: OolongSynthFixture, text: string): OolongScore {
  const score = scoreOolongSynthResponse(fixture.goldAnswer, text, fixture.manifest.answerType);
  return {
    score: score.score,
    attemptedParse: score.attemptedParse,
    parseConfidence:
      score.parseConfidence === "high" || score.parseConfidence === "vhigh" ? "high" : "low",
    answer: score.answer,
    answerType: typeof score.answer === "number" ? "integer" : "string",
  };
}

function answerPrefix(answerType: string): "Label" | "User" | "Date" | "Answer" {
  if (answerType === "ANSWER_TYPE.LABEL") return "Label";
  if (answerType === "ANSWER_TYPE.USER") return "User";
  if (answerType === "ANSWER_TYPE.DATE" || answerType === "ANSWER_TYPE.MONTH_YEAR") return "Date";
  return "Answer";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
