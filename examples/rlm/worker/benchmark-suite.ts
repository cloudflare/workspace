import { z } from "zod";

import developmentManifest from "../benchmarks/development.json?raw";

const benchmarkCaseSchema = z
  .object({
    id: z.string().min(1),
    role: z.literal("development"),
    dataset: z.enum(["oolongbench/oolong-real", "oolongbench/oolong-synth"]),
    datasetRevision: z.string().regex(/^[0-9a-f]{40}$/),
    config: z.enum(["dnd", "default"]),
    split: z.literal("test"),
    row: z.number().int().nonnegative(),
    sourceHash: z.string().regex(/^fnv1a-[0-9a-f]{8}$/),
    family: z.enum([
      "roll-count",
      "first-event",
      "semantic-frequency",
      "semantic-classification",
      "last-event-per-document",
    ]),
  })
  .strict();

const benchmarkManifestSchema = z
  .object({
    version: z.literal(1),
    description: z.string().min(1),
    cases: z.array(benchmarkCaseSchema).min(1),
  })
  .strict();

export type DevelopmentBenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export const DEVELOPMENT_BENCHMARK_CASES = parseDevelopmentManifest(developmentManifest);

function parseDevelopmentManifest(value: string): DevelopmentBenchmarkCase[] {
  let json: unknown;
  try {
    json = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Development benchmark manifest is not valid JSON.", { cause: error });
  }
  const parsed = benchmarkManifestSchema.safeParse(json);
  if (!parsed.success) throw new Error("Development benchmark manifest is invalid.");
  const ids = new Set(parsed.data.cases.map((item) => item.id));
  if (ids.size !== parsed.data.cases.length) {
    throw new Error("Development benchmark manifest contains duplicate case IDs.");
  }
  return parsed.data.cases;
}
