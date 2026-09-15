// Starting content for each question type in the editor.

export const newOptionId = () => Math.random().toString(36).slice(2, 8);

export function defaultItem(type: string): { interaction: Record<string, unknown>; scoring: Record<string, unknown> } {
  const options = () => Array.from({ length: 4 }, () => ({ id: newOptionId(), text: "" }));
  switch (type) {
    case "single-choice": {
      const opts = options();
      return { interaction: { options: opts }, scoring: { correctOptionId: opts[0].id, penalty: 0.25 } };
    }
    case "multiple-response":
      return { interaction: { options: options() }, scoring: { correctOptionIds: [], mode: "partial" } };
    case "true-false":
      return { interaction: { trueLabel: "True", falseLabel: "False" }, scoring: { correct: "true", penalty: 0.25 } };
    case "short-answer":
      return { interaction: { maxLength: 200 }, scoring: { acceptedAnswers: [""], caseSensitive: false, maxTypos: 0, manualReviewUnmatched: false } };
    default:
      return { interaction: {}, scoring: {} };
  }
}
