import { z } from "zod";
import { defineItemType } from "../types";
import { levenshtein, normalizeText, unanswered } from "../shared";

export const shortAnswer = defineItemType({
  key: "short-answer",
  label: "Short answer",
  description: "Candidates type a word or phrase, matched against accepted answers.",
  autoScored: true,
  interactionSchema: z.object({
    maxLength: z.number().int().min(1).max(2000).default(200),
    placeholder: z.string().max(120).optional(),
  }),
  scoringSchema: z.object({
    acceptedAnswers: z.array(z.string().trim().min(1).max(500)).min(1),
    caseSensitive: z.boolean().default(false),
    // Allowed typos per answer (edit distance). 0 means exact match after normalising spaces.
    maxTypos: z.number().int().min(0).max(3).default(0),
    // Send unmatched answers to the grading queue instead of marking them wrong.
    manualReviewUnmatched: z.boolean().default(false),
  }),
  responseSchema: z.object({ text: z.string().max(2000) }),
  layoutSchema: z.object({}),

  validate() {
    return [];
  },

  createLayout() {
    return {};
  },

  candidateView(interaction) {
    return { maxLength: interaction.maxLength, placeholder: interaction.placeholder };
  },

  isAnswered(response) {
    return Boolean(response?.text.trim());
  },

  score(response, scoring, _interaction, { maxPoints }) {
    const text = response?.text.trim() ?? "";
    if (!text) return unanswered(maxPoints);

    const given = normalizeText(text, scoring.caseSensitive);
    const match = scoring.acceptedAnswers.find((answer) => {
      const expected = normalizeText(answer, scoring.caseSensitive);
      // Typo tolerance never applies to very short answers, where one edit changes the meaning.
      const allowed = expected.length >= 5 ? scoring.maxTypos : 0;
      return levenshtein(given, expected) <= allowed;
    });

    if (match) return { points: maxPoints, maxPoints, isCorrect: true, needsManualGrading: false, detail: { matched: match } };
    if (scoring.manualReviewUnmatched) return { points: 0, maxPoints, isCorrect: null, needsManualGrading: true };
    return { points: 0, maxPoints, isCorrect: false, needsManualGrading: false };
  },
});
