import { z } from "zod";
import { defineItemType } from "../types";
import { optionListSchema, optionOrderLayoutSchema, orderOptions, presentOptions, roundPoints, unanswered } from "../shared";

export const multipleResponse = defineItemType({
  key: "multiple-response",
  label: "Multiple response",
  description: "Candidates select every correct option, with all-or-nothing or partial credit.",
  autoScored: true,
  interactionSchema: z.object({
    options: optionListSchema,
    minSelections: z.number().int().min(1).optional(),
    maxSelections: z.number().int().min(1).optional(),
  }),
  scoringSchema: z.object({
    correctOptionIds: z.array(z.string().min(1)).min(1),
    // all-or-nothing: full marks only for the exact set.
    // partial: share of correct options chosen; zero if every option is selected.
    // right-minus-wrong: (correct chosen − wrong chosen) / total correct, never below zero.
    mode: z.enum(["all-or-nothing", "partial", "right-minus-wrong"]).default("all-or-nothing"),
  }),
  responseSchema: z.object({ optionIds: z.array(z.string().min(1)) }),
  layoutSchema: optionOrderLayoutSchema,

  validate(interaction, scoring) {
    const errors: string[] = [];
    const ids = new Set(interaction.options.map((o) => o.id));
    if (!scoring.correctOptionIds.every((id) => ids.has(id))) errors.push("Every correct answer must be one of the options.");
    if (new Set(scoring.correctOptionIds).size !== scoring.correctOptionIds.length) errors.push("Correct answers must not repeat.");
    const { minSelections, maxSelections } = interaction;
    if (minSelections && maxSelections && minSelections > maxSelections) errors.push("Minimum selections cannot exceed the maximum.");
    if (maxSelections && maxSelections < scoring.correctOptionIds.length) errors.push("Maximum selections is lower than the number of correct answers.");
    return errors;
  },

  createLayout(interaction, { shuffle, random }) {
    return { optionOrder: orderOptions(interaction.options, shuffle, random) };
  },

  candidateView(interaction, layout) {
    return {
      options: presentOptions(interaction.options, layout.optionOrder),
      minSelections: interaction.minSelections,
      maxSelections: interaction.maxSelections,
    };
  },

  isAnswered(response) {
    return Boolean(response?.optionIds.length);
  },

  score(response, scoring, interaction, { maxPoints }) {
    const validIds = new Set(interaction.options.map((o) => o.id));
    const chosen = [...new Set(response?.optionIds ?? [])].filter((id) => validIds.has(id));
    if (chosen.length === 0) return unanswered(maxPoints);

    const correct = new Set(scoring.correctOptionIds);
    const right = chosen.filter((id) => correct.has(id)).length;
    const wrong = chosen.length - right;
    const exact = right === correct.size && wrong === 0;
    const overLimit = interaction.maxSelections !== undefined && chosen.length > interaction.maxSelections;

    let fraction: number;
    if (overLimit) fraction = 0;
    else if (scoring.mode === "all-or-nothing") fraction = exact ? 1 : 0;
    else if (scoring.mode === "partial") fraction = chosen.length === validIds.size && !exact ? 0 : right / correct.size;
    else fraction = Math.max(0, (right - wrong) / correct.size);

    return {
      points: roundPoints(maxPoints * fraction),
      maxPoints,
      isCorrect: exact,
      needsManualGrading: false,
      detail: { right, wrong, overLimit },
    };
  },

  review(interaction, scoring, response) {
    const chosen = new Set(response?.optionIds ?? []);
    const correct = new Set(scoring.correctOptionIds);
    return {
      kind: "choice",
      multiple: true,
      options: interaction.options.map((o) => ({ id: o.id, text: o.text, chosen: chosen.has(o.id), correct: correct.has(o.id) })),
    };
  },
});
