import type { Workspace } from "@cloudflare/computer";

import type {
  BenchmarkAgentState,
  BenchmarkLane,
  BenchmarkRun,
  BenchmarkSample,
  RunMetrics,
} from "../shared/types";
import {
  createOolongRealFixture,
  fetchOolongRealRow,
  OOLONG_CONTEXT_PATH,
  OOLONG_MANIFEST_PATH,
  rowForSample,
  verifyPublishedFixture,
} from "./benchmark";
import { type BenchmarkFixture, fixtureSampleMetadata } from "./fixture-types";
import { emptyRunMetrics, withCombinedMetrics } from "./metrics";
import { BENCHMARK_MODEL_ID } from "./model-id";
import {
  createOolongSynthFixture,
  fetchOolongSynthRow,
  OOLONG_SYNTH_DEMO_ROW,
  verifyOolongSynthFixture,
} from "./oolong-synth";

export const WORKSPACE_ROOT = "/workspace";
export const PARENT_DEADLINE_MS = 8 * 60_000;

export function boundedSignal(signal?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(PARENT_DEADLINE_MS);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

export function initialAgentState(lane: BenchmarkLane): BenchmarkAgentState {
  return {
    id: `${lane}-oolong`,
    lane,
    status: "idle",
    prompt: "",
    finalAnswer: "",
    error: null,
    startedAt: null,
    finishedAt: null,
    run: null,
    children: [],
  };
}

export async function loadFixture(
  sample: BenchmarkSample,
  signal?: AbortSignal,
): Promise<BenchmarkFixture> {
  if (sample === "synth-frequency") {
    const fixture = createOolongSynthFixture(
      await fetchOolongSynthRow(OOLONG_SYNTH_DEMO_ROW, { signal }),
    );
    verifyOolongSynthFixture(fixture);
    return fixture;
  }
  const fixture = createOolongRealFixture(
    await fetchOolongRealRow(rowForSample(sample), { signal }),
  );
  verifyPublishedFixture(fixture);
  return fixture;
}

export async function seedWorkspace(
  workspace: Workspace,
  fixture: BenchmarkFixture,
): Promise<void> {
  await workspace.ready();
  await workspace.fs.rm("/workspace/oolong-real", { recursive: true, force: true });
  await workspace.fs.mkdir("/workspace/oolong-real", { recursive: true });
  await workspace.fs.writeFile(OOLONG_CONTEXT_PATH, fixture.context);
  await Promise.all(
    fixture.chunks.map((chunk, index) => {
      const item = fixture.manifest.contextChunks[index];
      if (!item) throw new Error(`Missing Oolong chunk manifest ${index}.`);
      return workspace.fs.writeFile(item.path, chunk);
    }),
  );
  await workspace.fs.writeFile(OOLONG_MANIFEST_PATH, JSON.stringify(fixture.manifest, null, 2));
}

export function createRun(
  lane: BenchmarkLane,
  request: { runId: string; order?: number },
  fixture: BenchmarkFixture,
): BenchmarkRun {
  return {
    runId: request.runId,
    lane,
    modelId: BENCHMARK_MODEL_ID,
    sample: fixtureSampleMetadata(fixture),
    metrics: emptyRunMetrics(),
    score: null,
    order: request.order ?? null,
  };
}

export function updateMetrics(run: BenchmarkRun, metrics: RunMetrics): BenchmarkRun {
  return { ...run, metrics: withCombinedMetrics(metrics) };
}
