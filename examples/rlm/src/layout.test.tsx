import { describe, expect, it } from "vitest";

import appSource from "./App.tsx?raw";

describe("RLM trace layout", () => {
  it("keeps lane results inside a dedicated trace region with compact worker cards", () => {
    expect(appSource).toContain('className="lane-body"');
    expect(appSource).toContain('className="worker-grid"');
    expect(appSource).toContain("worker worker-");
  });

  it("uses RLM map/reduce language instead of stale transcript and chat language", () => {
    expect(appSource).toContain("Structured RLM");
    expect(appSource).toContain("Model map");
    expect(appSource).toContain("Reducer output");
    expect(appSource).toContain("Cancel comparison");
    expect(appSource).toContain("Waiting for the RLM map");
    expect(appSource).toContain("All three strategies are overlapping now");
    expect(appSource).toContain("Workers AI charges may apply");
    expect(appSource).not.toContain("Model response");
    expect(appSource).not.toContain("transcript");
  });
});
