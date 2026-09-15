import { z } from "zod";
import { defineItemType } from "../types";
import { optionListSchema, optionOrderLayoutSchema, orderOptions, presentOptions, roundPoints, unanswered } from "../shared";

export const singleChoice = defineItemType({
  key: "single-choice",
  label: "Single choice",
  description: "Candidates pick exactly one option. Options can be text or images.",
  autoScored: true,
  interactionSchema: z.object({ options: optionListSchema }),
  scoringSchema: z.object({
    correctOptionId: z.string().min(1),
    // Fraction of the item's points deducted for a wrong answer when the exam uses negative marking.
    penalty: z.number().min(0).max(1).default(0.25),
  }),
  responseSchema: z.object({ optionId: z.string().min(1) }),
  layoutSchema: optionOrderLayoutSchema,

  validate(interaction, scoring) {
    return interaction.options.some((o) => o.id === scoring.correctOptionId)
      ? []
      : ["The correct answer must be one of the options."];
  },

  createLayout(interaction, { shuffle, random }) {
    return { optionOrder: orderOptions(interaction.options, shuffle, random) };
  },

  candidateView(interaction, layout) {
    return { options: presentOptions(interaction.options, layout.optionOrder) };
  },

  isAnswered(response) {
    return Boolean(response?.optionId);
  },

  score(response, scoring, interaction, { maxPoints, negativeMarking }) {
    if (!response?.optionId || !interaction.options.some((o) => o.id === response.optionId)) {
      return unanswered(maxPoints);
    }
    const isCorrect = response.optionId === scoring.correctOptionId;
    const points = isCorrect ? maxPoints : negativeMarking ? -maxPoints * scoring.penalty : 0;
    return { points: roundPoints(points), maxPoints, isCorrect, needsManualGrading: false };
  },
});
