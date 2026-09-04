import { z } from "zod";

import {
  OOLONG_CONTEXT_PATH,
  OOLONG_MANIFEST_PATH,
  type OolongContextChunkManifest,
  splitUtf8Context,
} from "./benchmark";

export const OOLONG_SYNTH_DATASET = "oolongbench/oolong-synth" as const;
export const OOLONG_SYNTH_DATASET_REVISION = "f0d59eaf0febf130664cfceb710436c8e3216b2b" as const;
export const OOLONG_SYNTH_CONFIG = "default" as const;
export const OOLONG_SYNTH_SPLIT = "test" as const;
export const OOLONG_SYNTH_FETCH_TIMEOUT_MS = 10_000;
export const OOLONG_SYNTH_DEMO_ROW = 1200;
export const OOLONG_SYNTH_CHUNK_BYTES = 14 * 1024;

const DATASETS_SERVER_ROWS_URL = "https://datasets-server.huggingface.co/rows";
const MAX_ROWS_RESPONSE_BYTES = 32 * 1024 * 1024;

const externalRowSchema = z.object({
  row_idx: z.number().int().nonnegative(),
  row: z.object({
    id: z.union([z.string(), z.number()]),
    context_len: z.number().int().positive(),
    dataset: z.string().min(1),
    context_window_text: z.string(),
    context_window_text_with_labels: z.string(),
    question: z.string().min(1),
    task_group: z.string().min(1),
    task: z.string().min(1),
    answer: z.string().min(1),
    answer_type: z.string().min(1),
    input_subset: z.enum(["True", "False"]),
    num_labels: z.number().int().positive(),
    context_window_id: z.union([z.string(), z.number()]),
  }),
});

const externalRowsResponseSchema = z.object({
  rows: z.array(externalRowSchema).length(1),
});

export interface OolongSynthRow {
  rowIndex: number;
  id: string;
  contextLength: number;
  sourceDataset: string;
  context: string;
  question: string;
  taskGroup: string;
  task: string;
  answer: string;
  answerType: string;
  inputSubset: boolean;
  numLabels: number;
  contextWindowId: string;
}

export interface OolongSynthFixtureManifest {
  version: 1;
  taskId: "oolong-synth-v1";
  dataset: typeof OOLONG_SYNTH_DATASET;
  config: typeof OOLONG_SYNTH_CONFIG;
  split: typeof OOLONG_SYNTH_SPLIT;
  rowIndex: number;
  id: string;
  contextWindowId: string;
  question: string;
  questionType: string;
  taskGroup: string;
  task: string;
  answerType: string;
  sourceDataset: string;
  declaredContextLength: number;
  inputSubset: boolean;
  numLabels: number;
  contextPath: typeof OOLONG_CONTEXT_PATH;
  manifestPath: typeof OOLONG_MANIFEST_PATH;
  contextHash: string;
  contextBytes: number;
  contextChunkBytes: number;
  contextPreamble: string;
  contextChunks: OolongContextChunkManifest[];
  fixtureHash: string;
}

export interface OolongSynthFixture {
  kind: "synth";
  manifest: OolongSynthFixtureManifest;
  context: string;
  chunks: string[];
  contextHash: string;
  fixtureHash: string;
  goldAnswer: string;
}

export interface FetchOolongSynthRowOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export type OolongSynthParseConfidence = "low" | "med" | "high" | "vhigh";

export interface OolongSynthScore {
  score: number;
  answer: string | number;
  attemptedParse: string | number;
  parseConfidence: OolongSynthParseConfidence;
  fullAnswer: string;
}

export function parseOolongSynthRowsResponse(
  value: unknown,
  expectedRowIndex: number,
): OolongSynthRow {
  const parsed = externalRowsResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid Oolong-synth rows response.");
  const external = parsed.data.rows[0];
  if (!external) throw new Error("Invalid Oolong-synth rows response.");
  if (external.row_idx !== expectedRowIndex) {
    throw new Error(
      `Oolong-synth rows response returned unexpected row ${external.row_idx}; expected ${expectedRowIndex}.`,
    );
  }

  return {
    rowIndex: external.row_idx,
    id: String(external.row.id),
    contextLength: external.row.context_len,
    sourceDataset: external.row.dataset,
    context: external.row.context_window_text,
    question: external.row.question,
    taskGroup: external.row.task_group,
    task: external.row.task,
    answer: external.row.answer,
    answerType: external.row.answer_type,
    inputSubset: external.row.input_subset === "True",
    numLabels: external.row.num_labels,
    contextWindowId: String(external.row.context_window_id),
  };
}

export async function fetchOolongSynthRow(
  rowIndex: number,
  options: FetchOolongSynthRowOptions = {},
): Promise<OolongSynthRow> {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new Error("Invalid Oolong-synth row index.");
  }

  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new Error(`Oolong-synth rows request timed out after ${OOLONG_SYNTH_FETCH_TIMEOUT_MS}ms.`),
    );
  }, OOLONG_SYNTH_FETCH_TIMEOUT_MS);

  const url = new URL(DATASETS_SERVER_ROWS_URL);
  url.searchParams.set("dataset", OOLONG_SYNTH_DATASET);
  url.searchParams.set("config", OOLONG_SYNTH_CONFIG);
  url.searchParams.set("split", OOLONG_SYNTH_SPLIT);
  url.searchParams.set("offset", String(rowIndex));
  url.searchParams.set("length", "1");

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Oolong-synth rows request failed with HTTP ${response.status}.`);
    }
    return parseOolongSynthRowsResponse(await readBoundedJson(response), rowIndex);
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Oolong-synth rows request timed out after ${OOLONG_SYNTH_FETCH_TIMEOUT_MS}ms.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function createOolongSynthFixture(row: OolongSynthRow): OolongSynthFixture {
  const { preamble, chunks } = splitOolongSynthRecords(row.context);
  const encoder = new TextEncoder();
  const contextHash = fnv1a(row.context);
  let startByte = encoder.encode(preamble).byteLength;
  const contextChunks = chunks.map((chunk, index): OolongContextChunkManifest => {
    const byteLength = encoder.encode(chunk).byteLength;
    const item = {
      index,
      path: `/workspace/oolong-real/context-${String(index).padStart(4, "0")}.txt`,
      hash: fnv1a(chunk),
      byteLength,
      episode: null,
      partIndex: index,
      startByte,
      endByte: startByte + byteLength,
    };
    startByte += byteLength + 1;
    return item;
  });
  const publicFixture = {
    version: 1 as const,
    taskId: "oolong-synth-v1" as const,
    dataset: OOLONG_SYNTH_DATASET,
    config: OOLONG_SYNTH_CONFIG,
    split: OOLONG_SYNTH_SPLIT,
    rowIndex: row.rowIndex,
    id: row.id,
    contextWindowId: row.contextWindowId,
    question: row.question,
    questionType: `${row.taskGroup}:${row.task}`,
    taskGroup: row.taskGroup,
    task: row.task,
    answerType: row.answerType,
    sourceDataset: row.sourceDataset,
    declaredContextLength: row.contextLength,
    inputSubset: row.inputSubset,
    numLabels: row.numLabels,
    contextPath: OOLONG_CONTEXT_PATH,
    manifestPath: OOLONG_MANIFEST_PATH,
    contextHash,
    contextBytes: encoder.encode(row.context).byteLength,
    contextChunkBytes: OOLONG_SYNTH_CHUNK_BYTES,
    contextPreamble: preamble,
    contextChunks,
  };
  const fixtureHash = fnv1a(stableJson(publicFixture));
  return {
    kind: "synth",
    manifest: { ...publicFixture, fixtureHash },
    context: row.context,
    chunks,
    contextHash,
    fixtureHash,
    goldAnswer: row.answer,
  };
}

export function splitOolongSynthRecords(
  context: string,
  maxBytes = OOLONG_SYNTH_CHUNK_BYTES,
): { preamble: string; chunks: string[] } {
  const lines = context.split("\n");
  const firstRecord = lines.findIndex((line) => line.startsWith("Date:"));
  if (firstRecord < 0) return { preamble: "", chunks: splitUtf8Context(context, maxBytes) };

  const preamble = lines.slice(0, firstRecord).join("\n").trim();
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 0;
  const encoder = new TextEncoder();
  for (const line of lines.slice(firstRecord).filter(Boolean)) {
    const lineBytes = encoder.encode(line).byteLength;
    if (lineBytes > maxBytes) throw new Error("Oolong-synth record exceeded the chunk byte limit.");
    const separatorBytes = current.length === 0 ? 0 : 1;
    if (current.length > 0 && currentBytes + separatorBytes + lineBytes > maxBytes) {
      chunks.push(current.join("\n"));
      current = [];
      currentBytes = 0;
    }
    current.push(line);
    currentBytes += (current.length === 1 ? 0 : 1) + lineBytes;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return { preamble, chunks };
}

export function hashOolongSynthSourceRow(row: OolongSynthRow): string {
  return fnv1a(stableJson(row));
}

export function verifyOolongSynthFixture(fixture: OolongSynthFixture): void {
  if (
    fixture.manifest.rowIndex !== OOLONG_SYNTH_DEMO_ROW ||
    fixture.manifest.id !== "617060021" ||
    hashOolongSynthFixtureSource(fixture) !== "fnv1a-a7b6af80"
  ) {
    throw new Error("Oolong-synth sample did not match the published fixture manifest.");
  }
}

function hashOolongSynthFixtureSource(fixture: OolongSynthFixture): string {
  return hashOolongSynthSourceRow({
    rowIndex: fixture.manifest.rowIndex,
    id: fixture.manifest.id,
    contextLength: fixture.manifest.declaredContextLength,
    sourceDataset: fixture.manifest.sourceDataset,
    context: fixture.context,
    question: fixture.manifest.question,
    taskGroup: fixture.manifest.taskGroup,
    task: fixture.manifest.task,
    answer: fixture.goldAnswer,
    answerType: fixture.manifest.answerType,
    inputSubset: fixture.manifest.inputSubset,
    numLabels: fixture.manifest.numLabels,
    contextWindowId: fixture.manifest.contextWindowId,
  });
}

export function scoreOolongSynthResponse(
  goldAnswer: string,
  output: string,
  answerType: string,
): OolongSynthScore {
  let answer = parseOolongSynthGold(goldAnswer);
  const parsed = parseOolongSynthResponse(output);
  let attemptedParse: string | number = parsed.answer;
  let parseConfidence = parsed.confidence;
  let score = 0;

  if (String(attemptedParse) === String(answer)) {
    score = 1;
  } else if (
    typeof attemptedParse === "string" &&
    ["more common", "less common", "same frequency"].includes(attemptedParse) &&
    String(answer).includes(attemptedParse)
  ) {
    score = 1;
  } else if (answerType === "ANSWER_TYPE.NUMERIC") {
    const attemptedNumber = Number(attemptedParse);
    const goldNumber = Number(answer);
    if (Number.isInteger(attemptedNumber) && Number.isInteger(goldNumber)) {
      attemptedParse = attemptedNumber;
      answer = goldNumber;
      score = 0.75 ** Math.abs(goldNumber - attemptedNumber);
    } else {
      parseConfidence = "low";
    }
  } else if (answerType === "ANSWER_TYPE.DATE") {
    const attemptedDate = normalizeDate(String(attemptedParse));
    if (attemptedDate === String(answer)) score = 1;
    else parseConfidence = "low";
  }

  return { score, answer, attemptedParse, parseConfidence, fullAnswer: output };
}

export function parseOolongSynthResponse(output: string): {
  answer: string;
  confidence: OolongSynthParseConfidence;
} {
  if (!output.includes(":")) {
    return {
      answer: output.length < 20 ? output : (output.trim().split(/\s+/).at(-1) ?? output),
      confidence: "low",
    };
  }

  let answer = output.split(":").at(-1)?.trim() ?? "";
  answer = answer.replaceAll("*", "").replaceAll("[", "").replaceAll("]", "");
  let confidence: OolongSynthParseConfidence = "med";
  if (/User:|Answer:|Date:|Label/.test(output)) confidence = "high";
  if (answer.length < 20) confidence = "vhigh";
  else if (answer.includes("more common")) answer = "more common";
  else if (answer.includes("less common")) answer = "less common";
  else if (answer.includes("same frequency")) answer = "same frequency";
  return { answer, confidence };
}

export function parseOolongSynthGold(answer: string): string | number {
  const date = answer.match(/^\[datetime\.date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)\]$/);
  if (date) {
    return `${date[1]}-${date[2]?.padStart(2, "0")}-${date[3]?.padStart(2, "0")}`;
  }

  const item = answer.match(/^\[(.*)\]$/)?.[1]?.trim();
  if (item === undefined) throw new Error("Invalid Oolong-synth gold answer.");
  if (/^[+-]?\d+$/.test(item)) return Number(item);
  const quoted = item.match(/^(['"])(.*?)\1(?:\s*,|$)/);
  if (!quoted) throw new Error("Invalid Oolong-synth gold answer.");
  return (quoted[2] ?? "").replaceAll("\\'", "'").replaceAll('\\"', '"');
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ROWS_RESPONSE_BYTES) {
    throw new Error("Oolong-synth rows response exceeded the byte limit.");
  }
  if (!response.body) throw new Error("Oolong-synth rows response had no body.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ROWS_RESPONSE_BYTES) {
        await reader.cancel("Oolong-synth rows response exceeded the byte limit.");
        throw new Error("Oolong-synth rows response exceeded the byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch (error) {
    throw new Error("Oolong-synth rows response was not valid UTF-8 JSON.", { cause: error });
  }
}

function normalizeDate(value: string): string | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
