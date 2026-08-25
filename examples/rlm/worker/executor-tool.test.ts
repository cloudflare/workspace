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

  it("drops untyped, oversized, and error output", () => {
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
        result: { evidence: "raw corpus evidence" },
      }),
    ).not.toHaveProperty("result");
    expect(
      sanitizeExecutorOutput({
        ...base,
        exitCode: 0,
        stdout: "",
        stderr: "",
        result: { answer: "x".repeat(17 * 1024) },
      }),
    ).not.toHaveProperty("result");
    expect(
      sanitizeExecutorOutput({
        ...base,
        error: "generated code threw raw corpus text",
      }),
    ).toEqual({ ...base, error: "Generated execution failed." });
  });
});
