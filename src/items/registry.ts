import type { AnyItemTypeDefinition, ItemReview, Random, ScoreContext, ScoreResult } from "./types";
import { singleChoice } from "./single-choice";
import { trueFalse } from "./true-false";
import { multipleResponse } from "./multiple-response";
import { shortAnswer } from "./short-answer";
import { unanswered } from "./shared";

const definitions: AnyItemTypeDefinition[] = [singleChoice, multipleResponse, trueFalse, shortAnswer];

export const itemTypes = new Map(definitions.map((d) => [d.key, d]));

export const itemTypeKeys = definitions.map((d) => d.key) as [string, ...string[]];

export function getItemType(key: string): AnyItemTypeDefinition {
  const definition = itemTypes.get(key);
  if (!definition) throw new Error(`Unknown question type "${key}".`);
  return definition;
}

export type ParsedItem = { interaction: unknown; scoring: unknown };

/** Parse and cross-validate authored content. Returns defaults applied, or readable errors. */
export function parseAuthoredItem(type: string, interaction: unknown, scoring: unknown):
  | { ok: true; value: ParsedItem }
  | { ok: false; errors: string[] } {
  const definition = itemTypes.get(type);
  if (!definition) return { ok: false, errors: [`Unknown question type "${type}".`] };

  const parsedInteraction = definition.interactionSchema.safeParse(interaction);
  const parsedScoring = definition.scoringSchema.safeParse(scoring);
  const errors = [
    ...(parsedInteraction.success ? [] : parsedInteraction.error.issues.map((i) => i.message)),
    ...(parsedScoring.success ? [] : parsedScoring.error.issues.map((i) => i.message)),
  ];
  if (errors.length || !parsedInteraction.success || !parsedScoring.success) return { ok: false, errors };

  const crossErrors = definition.validate(parsedInteraction.data, parsedScoring.data);
  if (crossErrors.length) return { ok: false, errors: crossErrors };
  return { ok: true, value: { interaction: parsedInteraction.data, scoring: parsedScoring.data } };
}

export function createLayout(type: string, interaction: unknown, shuffle: boolean, random: Random = Math.random) {
  const definition = getItemType(type);
  return definition.createLayout(definition.interactionSchema.parse(interaction), { shuffle, random });
}

export function candidateView(type: string, interaction: unknown, layout: unknown) {
  const definition = getItemType(type);
  return definition.candidateView(definition.interactionSchema.parse(interaction), definition.layoutSchema.parse(layout));
}

/** Returns null when the value is not a valid response for this type. */
export function parseResponse(type: string, value: unknown): unknown | null {
  if (value === null || value === undefined) return null;
  const parsed = getItemType(type).responseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isAnswered(type: string, value: unknown): boolean {
  return getItemType(type).isAnswered(parseResponse(type, value));
}

export function reviewItem(type: string, input: { interaction: unknown; scoring: unknown; response: unknown }): ItemReview {
  const definition = getItemType(type);
  return definition.review(
    definition.interactionSchema.parse(input.interaction),
    definition.scoringSchema.parse(input.scoring),
    parseResponse(type, input.response),
  );
}

export function scoreItem(type: string, input: { interaction: unknown; scoring: unknown; response: unknown }, context: ScoreContext): ScoreResult {
  const definition = getItemType(type);
  const response = parseResponse(type, input.response);
  if (response === null) return unanswered(context.maxPoints);
  return definition.score(response, definition.scoringSchema.parse(input.scoring), definition.interactionSchema.parse(input.interaction), context);
}
