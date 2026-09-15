import { z } from "zod";
import { defineItemType } from "../types";
import { roundPoints, unanswered } from "../shared";

const values = z.enum(["true", "false"]);

export const trueFalse = defineItemType({
  key: "true-false",
  label: "True / False",
  description: "Candidates decide whether a statement is true or false.",
  autoScored: true,
  interactionSchema: z.object({
    trueLabel: z.string().trim().min(1).max(40).default("True"),
    falseLabel: z.string().trim().min(1).max(40).default("False"),
  }),
  scoringSchema: z.object({
    correct: values,
    penalty: z.number().min(0).max(1).default(0.25),
  }),
  responseSchema: z.object({ optionId: values }),
  // True always comes first; shuffling a two-option statement only confuses candidates.
  layoutSchema: z.object({}),

  validate() {
    return [];
  },

  createLayout() {
    return {};
  },

  candidateView(interaction) {
    return {
      options: [
        { id: "true", text: interaction.trueLabel },
        { id: "false", text: interaction.falseLabel },
      ],
    };
  },

  isAnswered(response) {
    return Boolean(response?.optionId);
  },

  score(response, scoring, _interaction, { maxPoints, negativeMarking }) {
    if (!response?.optionId) return unanswered(maxPoints);
    const isCorrect = response.optionId === scoring.correct;
    const points = isCorrect ? maxPoints : negativeMarking ? -maxPoints * scoring.penalty : 0;
    return { points: roundPoints(points), maxPoints, isCorrect, needsManualGrading: false };
  },
});
