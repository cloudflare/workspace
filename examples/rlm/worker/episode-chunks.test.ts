import { describe, expect, it } from "vitest";

import { splitOolongEpisodes } from "./benchmark";

describe("episode-aligned Oolong chunks", () => {
  it("ignores marker examples and aligns substantive transcript ranges", () => {
    const intro = "Instructions mention [START OF EPISODE] and [END OF EPISODE].\n";
    const first = `[START OF EPISODE]${"a".repeat(2_000)}[END OF EPISODE]`;
    const second = `[START OF EPISODE]${"b".repeat(2_000)}[END OF EPISODE]`;
    const chunks = splitOolongEpisodes(`${intro}${first}${second}`, [27, 28]);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.episode)).toEqual([27, 28]);
    expect(chunks.map((chunk) => chunk.partIndex)).toEqual([0, 0]);
    expect(chunks[0]?.startByte).toBeLessThan(chunks[1]?.startByte ?? 0);
    expect(chunks.every((chunk) => chunk.endByte > chunk.startByte)).toBe(true);
  });

  it("falls back to bounded chunks when markers do not match metadata", () => {
    const chunks = splitOolongEpisodes("plain transcript", [2]);

    expect(chunks).toMatchObject([
      { text: "plain transcript", episode: 2, partIndex: 0, startByte: 0 },
    ]);
  });
});
