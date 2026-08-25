export type BenchmarkLane = "direct" | "executor" | "rlm";
export type RunStatus = "idle" | "loading" | "running" | "completed" | "failed" | "cancelled";

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface InferenceUsage extends TokenUsage {
  attemptedCalls: number;
  completedCalls: number;
  accountedCalls: number;
  inputTokensExact: boolean;
  outputTokensExact: boolean;
  totalTokensExact: boolean;
}

export interface RunMetrics {
  parent: InferenceUsage;
  children: InferenceUsage;
  combined: InferenceUsage;
  durationMs: number | null;
  executionAttempts: number;
  generatedSourceBytes: number;
  executionResultBytes: number;
}

export interface OolongSampleMetadata {
  dataset: "oolongbench/oolong-real" | "oolongbench/oolong-synth";
  datasetRevision:
    | "6bc9ef04866fcf005c9749b70649be69dd37fffb"
    | "f0d59eaf0febf130664cfceb710436c8e3216b2b";
  config: "dnd" | "default";
  split: "test";
  row: number;
  id: string;
  contextWindowId: string;
  questionType: string;
  question: string;
  contextBytes: number;
  contextHash: string;
  chunkCount: number;
}

export interface OolongScore {
  score: number;
  attemptedParse: number | string | string[];
  parseConfidence: "low" | "high";
  answer: number | string | string[];
  answerType: "integer" | "string" | "list";
}

export interface ChildCallTrace {
  id: string;
  index: number;
  status: "running" | "completed" | "failed";
  durationMs: number | null;
  usage: TokenUsage;
  error: string | null;
}

export interface BenchmarkRun {
  runId: string;
  lane: BenchmarkLane;
  modelId: string;
  sample: OolongSampleMetadata;
  metrics: RunMetrics;
  score: OolongScore | null;
  order: number | null;
}

export interface BenchmarkAgentState {
  id: string;
  lane: BenchmarkLane;
  status: RunStatus;
  prompt: string;
  finalAnswer: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  run: BenchmarkRun | null;
  children: ChildCallTrace[];
}

export type OolongRealSample =
  | "rolls"
  | "spell-order"
  | "rare-spells"
  | "upcast-spells"
  | "long-spell-sequence";
export type OolongSynthSample = "synth-frequency";
export type BenchmarkSample = OolongRealSample | OolongSynthSample;

interface BenchmarkRequestFields {
  runId: string;
  order?: number;
}

export interface BenchmarkRequest {
  benchmark:
    | (BenchmarkRequestFields & {
        taskId: "oolong-real-dnd-v1";
        sample: OolongRealSample;
      })
    | (BenchmarkRequestFields & {
        taskId: "oolong-synth-v1";
        sample: OolongSynthSample;
      });
}
