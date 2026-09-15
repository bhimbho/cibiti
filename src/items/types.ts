import type { z } from "zod";

export type Random = () => number;

export type ScoreContext = {
  maxPoints: number;
  negativeMarking: boolean;
};

export type ScoreResult = {
  points: number;
  maxPoints: number;
  // null when the response needs a human grader.
  isCorrect: boolean | null;
  needsManualGrading: boolean;
  detail?: Record<string, unknown>;
};

/**
 * Everything the platform needs to know about one question type.
 * Definitions are pure (no DB, no React) so they run in route handlers, workers and tests.
 */
export type ItemTypeDefinition<Interaction, Scoring, Response, Layout> = {
  key: string;
  label: string;
  description: string;
  autoScored: boolean;
  interactionSchema: z.ZodType<Interaction>;
  scoringSchema: z.ZodType<Scoring>;
  responseSchema: z.ZodType<Response>;
  layoutSchema: z.ZodType<Layout>;
  /** Cross-field authoring checks, e.g. the key must reference an existing option. */
  validate(interaction: Interaction, scoring: Scoring): string[];
  /** Decide the delivered layout once, at attempt start. Stored so review is reproducible. */
  createLayout(interaction: Interaction, options: { shuffle: boolean; random: Random }): Layout;
  /** What the candidate's browser receives. Must never include the answer key. */
  candidateView(interaction: Interaction, layout: Layout): unknown;
  isAnswered(response: Response | null): boolean;
  score(response: Response | null, scoring: Scoring, interaction: Interaction, context: ScoreContext): ScoreResult;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyItemTypeDefinition = ItemTypeDefinition<any, any, any, any>;

export function defineItemType<I, S, R, L>(definition: ItemTypeDefinition<I, S, R, L>) {
  return definition;
}
