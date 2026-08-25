import CHUNK_READING from "./chunk-reading.txt?raw";
import type { BenchmarkFixture } from "./fixture-types";
import { RLM_SYSTEM_PROMPT } from "./prompts";
import REQUEST_SHAPE from "./request-shape.txt?raw";
import INTERFACES from "./rlm-interfaces.txt?raw";
import BASE_STRATEGY from "./structured-rlm-prompt.txt?raw";

export type RlmTaskKind =
  | "roll_count"
  | "first_spell_by_character"
  | "least_common_spell"
  | "upcast_spells"
  | "last_spell_by_episode"
  | "semantic_label_frequency"
  | "generic";

export interface RlmTaskSpec {
  version: "structured-v1";
  kind: RlmTaskKind;
  targetCharacter: string | null;
}

export function classifyRlmTask(questionType: string, question: string): RlmTaskSpec {
  const normalized = question.trim();
  let kind: RlmTaskKind = "generic";
  let targetCharacter: string | null = null;

  if (questionType.startsWith("counting:TASK_TYPE.")) {
    kind = "semantic_label_frequency";
  } else if (/total number of rolls/i.test(normalized)) {
    kind = "roll_count";
  } else if (/first spell cast by each character/i.test(normalized)) {
    kind = "first_spell_by_character";
  } else if (/least common spell/i.test(normalized)) {
    kind = "least_common_spell";
  } else if (/higher than (?:their|its) base level/i.test(normalized)) {
    kind = "upcast_spells";
  } else {
    const lastSpell = normalized.match(
      /last spell cast by the character ([^?]+?) in each episode/i,
    );
    if (lastSpell && questionType === "multidoc_spells") {
      kind = "last_spell_by_episode";
      targetCharacter = lastSpell[1]?.trim() || null;
    }
  }

  return { version: "structured-v1", kind, targetCharacter };
}

export function structuredRlmSystemPrompt(fixture: BenchmarkFixture): string {
  const task = classifyRlmTask(fixture.manifest.questionType, fixture.manifest.question);
  return `${RLM_SYSTEM_PROMPT}\n\nSTRUCTURED-V1 STRATEGY:\n${BASE_STRATEGY}\n\n${taskInstructions(task)}\n\n${INTERFACES}\n${REQUEST_SHAPE}\n${CHUNK_READING}\n\nStrategy metadata (public, gold-free): ${JSON.stringify(
    {
      version: task.version,
      kind: task.kind,
      targetCharacter: task.targetCharacter,
      questionType: fixture.manifest.questionType,
      episodes: "episodes" in fixture.manifest ? fixture.manifest.episodes : [],
      question: fixture.manifest.question,
    },
  )}`;
}

function taskInstructions(task: RlmTaskSpec): string {
  const common = `Use one short child prompt for every request. Require JSON only, with no Markdown or prose. Include only actual events in the supplied partition. Exclude mentions, plans, recaps, hypothetical actions, and failed attempts. Parse each successful child text with JSON.parse inside try/catch. Validate every field and Ignore malformed child results. Use result.index to recover the matching chunk metadata.`;

  switch (task.kind) {
    case "roll_count":
      return `${common}\n\nMAP: Return exactly {"rollCount":0}, where rollCount is a non-negative integer counting actual dice rolls in this partition. Spoken numbers, modifiers, and hypothetical rolls do not count.\n\nREDUCE: Sum rollCount from every valid partition and return { answer: total }.`;
    case "first_spell_by_character":
      return `${common}\n\nMAP: Return exactly {"firstCasts":[{"character":"name","spell":"canonical spell name","localOffset":0,"evidence":"short quote"}]}. Return at most the first actual spell cast by each character in this partition. localOffset is the character offset where the evidence starts in input.text.\n\nREDUCE: Compute each position as [chunk.startByte + localOffset, chunk.index]. Sort by position, retain the earliest position for each normalized character, sort those retained casts by position, and return their canonical spell names. This selects the earliest position for each character without another model call.`;
    case "least_common_spell":
      return `${common}\n\nMAP: Return exactly {"spellCounts":[{"spell":"canonical spell name","count":1}]}. Count every actual spell cast in this partition and group identical spell names. Do not emit one object per cast.\n\nREDUCE: Normalize spell names for grouping, sum counts across all valid partitions, find the minimum positive total, and return every canonical spell name tied at that minimum positive total.`;
    case "upcast_spells":
      return `${common}\n\nMAP: Return exactly {"upcasts":[{"spell":"canonical spell name","castLevel":3,"baseLevel":1,"localOffset":0,"evidence":"short quote"}]}. Include only actual casts supported as above base level. castLevel and baseLevel must be integers, and localOffset locates the evidence in input.text.\n\nREDUCE: Keep only entries where castLevel > baseLevel, sort by [chunk.startByte + localOffset, chunk.index], deduplicate normalized spell names, and return canonical names in first-evidence order.`;
    case "last_spell_by_episode":
      return `${common}\n\nMAP: The target character is ${JSON.stringify(task.targetCharacter)}. Return exactly {"lastTargetCast":{"spell":"canonical spell name","localOffset":0,"evidence":"short quote"}}, or {"lastTargetCast":null}. Return only the final actual cast by the target character in this partition. Character attribution is semantic: a transcript speaker may be the player who controls the target character.\n\nREDUCE: For each valid candidate, require a chunk episode and compute its position as [chunk.partIndex, chunk.startByte + localOffset, chunk.index]. Retain the greatest position in each episode. Return one canonical spell name for every manifest episode, in manifest.episodes order. This selects the greatest position in each episode without another model call.`;
    case "semantic_label_frequency":
      return `${common}\n\nMAP: Each input also includes preamble, which defines the complete allowed label list and classification rule. input.text contains one Date/User/Instance record per line. Return exactly {"labelCounts":{"label name":0},"records":0}. Classify every record exactly once, include every allowed label even when its count is zero, and make records equal to the sum of labelCounts. Do not estimate or skip hard records.\n\nREDUCE: Reject a child object unless records is a non-negative integer equal to the sum of its non-negative integer labelCounts. Sum each label across all valid partitions. Answer the manifest question from those exact totals. For a least-frequency tie, choose the tied label that appears first in the preamble's allowed-label list. Return only the selected label or requested number in { answer }.`;
    case "generic":
      return `${common}\n\nMAP: Return exactly {"findings":[{"value":"concise finding","localOffset":0,"evidence":"short quote"}]}.\n\nREDUCE: Sort valid findings by chunk.startByte + localOffset and compute the requested answer deterministically. Return { answer }.`;
  }
}
