import type { OolongParsedAnswer } from "./benchmark";

export function summarizeParsedAnswer(value: OolongParsedAnswer): OolongParsedAnswer {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}…` : value;
  return value.slice(0, 20).map((item) => (item.length > 160 ? `${item.slice(0, 157)}…` : item));
}
