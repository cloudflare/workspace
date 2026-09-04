import { describe, expect, it } from "vitest";

import {
  createOolongSynthFixture,
  fetchOolongSynthRow,
  hashOolongSynthSourceRow,
  OOLONG_SYNTH_DATASET,
  OOLONG_SYNTH_DATASET_REVISION,
  type OolongSynthRow,
  parseOolongSynthRowsResponse,
  scoreOolongSynthResponse,
} from "./oolong-synth";

const ROW: OolongSynthRow = {
  rowIndex: 42,
  id: "810080042",
  contextLength: 131_072,
  sourceDataset: "metaphors",
  context: "One unlabeled semantic classification record.",
  question: "Which label is most common?",
  taskGroup: "counting",
  task: "TASK_TYPE.MOST_FREQ",
  answer: "['incorrect']",
  answerType: "ANSWER_TYPE.LABEL",
  inputSubset: false,
  numLabels: 2,
  contextWindowId: "80042",
};

function rowsPayload(row: OolongSynthRow = ROW): unknown {
  return {
    rows: [
      {
        row_idx: row.rowIndex,
        row: {
          id: Number(row.id),
          context_len: row.contextLength,
          dataset: row.sourceDataset,
          context_window_text: row.context,
          context_window_text_with_labels: "host-only labeled context",
          question: row.question,
          task_group: row.taskGroup,
          task: row.task,
          answer: row.answer,
          answer_type: row.answerType,
          input_subset: String(row.inputSubset).replace(/^./, (value) => value.toUpperCase()),
          num_labels: row.numLabels,
          context_window_id: Number(row.contextWindowId),
        },
      },
    ],
  };
}

describe("Oolong-synth adapter", () => {
  it("pins the official dataset revision", () => {
    expect(OOLONG_SYNTH_DATASET).toBe("oolongbench/oolong-synth");
    expect(OOLONG_SYNTH_DATASET_REVISION).toBe("f0d59eaf0febf130664cfceb710436c8e3216b2b");
  });

  it("parses the external row without exposing the labeled context", () => {
    expect(parseOolongSynthRowsResponse(rowsPayload(), 42)).toEqual(ROW);
    expect(JSON.stringify(parseOolongSynthRowsResponse(rowsPayload(), 42))).not.toContain(
      "host-only labeled context",
    );
  });

  it("rejects malformed rows and unexpected offsets", () => {
    expect(() => parseOolongSynthRowsResponse({ rows: [] }, 42)).toThrow(
      "Invalid Oolong-synth rows response",
    );
    expect(() => parseOolongSynthRowsResponse(rowsPayload({ ...ROW, rowIndex: 43 }), 42)).toThrow(
      "unexpected row",
    );
  });

  it("hashes every source field, including context and gold", () => {
    const hash = hashOolongSynthSourceRow(ROW);

    expect(hashOolongSynthSourceRow({ ...ROW })).toBe(hash);
    expect(hashOolongSynthSourceRow({ ...ROW, context: `${ROW.context}!` })).not.toBe(hash);
    expect(hashOolongSynthSourceRow({ ...ROW, answer: "['correct']" })).not.toBe(hash);
  });

  it("creates record-aligned chunks with a reusable classification preamble", () => {
    const fixture = createOolongSynthFixture({
      ...ROW,
      context: [
        "Classify each record as Alpha or Beta.",
        "",
        "Calculate exact aggregate statistics.",
        "",
        "Date: Jan 01, 2024 || User: 1 || Instance: first record",
        "Date: Jan 02, 2024 || User: 2 || Instance: second record",
      ].join("\n"),
    });

    expect(fixture.manifest.contextPreamble).toContain("Classify each record");
    expect(fixture.chunks.join("\n")).toContain("Instance: first record");
    expect(fixture.chunks.every((chunk) => chunk.startsWith("Date:"))).toBe(true);
    expect(JSON.stringify(fixture.manifest)).not.toContain(ROW.answer);
  });

  it("fetches one row from the pinned dataset coordinates", async () => {
    let requestedUrl = "";
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(rowsPayload()));
    };

    await expect(fetchOolongSynthRow(42, { fetcher })).resolves.toEqual(ROW);
    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe("https://datasets-server.huggingface.co/rows");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      dataset: "oolongbench/oolong-synth",
      config: "default",
      split: "test",
      offset: "42",
      length: "1",
    });
  });
});

describe("official Oolong-synth scoring", () => {
  it("scores the first official gold item and accepted comparison wording", () => {
    expect(
      scoreOolongSynthResponse(
        "['Society & Culture', 'Entertainment & Music']",
        "Label: Society & Culture",
        "ANSWER_TYPE.LABEL",
      ),
    ).toMatchObject({ score: 1, answer: "Society & Culture" });
    expect(
      scoreOolongSynthResponse("['incorrect']", "Label: incorrect", "ANSWER_TYPE.LABEL"),
    ).toMatchObject({ score: 1, attemptedParse: "incorrect" });
    expect(
      scoreOolongSynthResponse(
        "['less common than']",
        "Answer: less common",
        "ANSWER_TYPE.COMPARISON",
      ).score,
    ).toBe(1);
  });

  it("gives official exponential partial credit to numeric answers", () => {
    expect(scoreOolongSynthResponse("[5]", "Answer: 3", "ANSWER_TYPE.NUMERIC").score).toBeCloseTo(
      0.75 ** 2,
    );
  });

  it("scores official datetime gold values as ISO dates", () => {
    expect(
      scoreOolongSynthResponse(
        "[datetime.date(2024, 12, 20)]",
        "Date: 2024-12-20",
        "ANSWER_TYPE.DATE",
      ).score,
    ).toBe(1);
  });

  it("preserves the official low-confidence last-word fallback", () => {
    expect(
      scoreOolongSynthResponse(
        "['correct']",
        "The answer is probably the label named correct",
        "ANSWER_TYPE.LABEL",
      ),
    ).toMatchObject({ score: 1, attemptedParse: "correct", parseConfidence: "low" });
  });
});
