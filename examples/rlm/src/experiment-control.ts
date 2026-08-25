import type { BenchmarkLane } from "../shared/types";

export const COMPARISON_LANES: BenchmarkLane[] = ["direct", "executor", "rlm"];

export function lanesToLaunch(
  started: ReadonlySet<BenchmarkLane>,
  cancelled: boolean,
  rlmMapStarted: boolean,
): BenchmarkLane[] {
  if (cancelled) return [];
  if (!started.has("rlm")) return ["rlm"];
  if (!rlmMapStarted) return [];
  return (["direct", "executor"] as BenchmarkLane[]).filter((lane) => !started.has(lane));
}
