import { describe, expect, it } from "vitest";

import { sanitizeExecutorOutput } from "./executor-tool";

const base = {
  command: "export default async function () {}",
  cwd: null,
  backend: "oolong-javascript",
};

describe("executor output sanitation", () => {
  it("keeps only a bounded typed answer from generated execution", () => {
    expect(
      sanitizeExecutorOutput({
        ...base,
        exitCode: 0,
        stdout: "raw corpus line",
        stderr: "another raw corpus line",
        result: {
          answer: ["Fireball", "Magic Missile"],
          evidence: "raw corpus evidence",
        },
      }),
    ).toEqual({
      ...base,
      exitCode: 0,
      stdout: "",
      stderr: "",
      result: { answer: ["Fireball", "Magic Missile"] },
    });
  });

  it("summarizes rejected output without exposing its values", () => {
    expect(
      sanitizeExecutorOutput({
        ...base,
        exitCode: 0,
        stdout: "",
        stderr: "",
        result: 42,
      }),
    ).toMatchObject({ result: { answer: 42 } });
    expect(
      sanitizeExecutorOutput({
        ...base,
        exitCode: 0,
        stdout: "raw corpus",
        stderr: "",
        result: { diagnostic: "raw corpus evidence" },
      }),
    ).toMatchObject({
      stdout: "",
      result: {
        accepted: false,
        reason: "Expected a bounded scalar/list or an object containing answer.",
        received: "object without answer",
      },
    });
    expect(
      sanitizeExecutorOutput({
        ...base,
        exitCode: 0,
        stdout: "",
        stderr: "",
        result: { answer: "x".repeat(17 * 1024) },
      }),
    ).toMatchObject({
      result: {
        accepted: false,
        received: "object with answer",
      },
    });
    expect(
      sanitizeExecutorOutput({
        ...base,
        error: "generated code threw raw corpus text",
      }),
    ).toEqual({ ...base, error: "Generated execution failed." });
  });
});
