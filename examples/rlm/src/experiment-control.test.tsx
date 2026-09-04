import { describe, expect, it } from "vitest";

import { lanesToLaunch } from "./experiment-control";

describe("comparison launch", () => {
  it("starts the RLM lane first", () => {
    expect(lanesToLaunch(new Set(), false, false)).toEqual(["rlm"]);
  });

  it("starts both baselines when RLM map work begins", () => {
    expect(lanesToLaunch(new Set(["rlm"]), false, true)).toEqual(["direct", "executor"]);
  });

  it("does not launch a lane twice or launch after cancellation", () => {
    expect(lanesToLaunch(new Set(["rlm"]), false, false)).toEqual([]);
    expect(lanesToLaunch(new Set(["rlm", "direct"]), false, true)).toEqual(["executor"]);
    expect(lanesToLaunch(new Set(), true, false)).toEqual([]);
  });
});
