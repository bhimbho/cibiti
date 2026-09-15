import { describe, expect, it } from "vitest";
import { candidateView, createLayout, isAnswered, parseAuthoredItem, scoreItem } from "./registry";
import { levenshtein, orderOptions } from "./shared";

const options = [
  { id: "a", text: "Abuja" },
  { id: "b", text: "Lagos" },
  { id: "c", text: "Kano" },
  { id: "d", text: "None of the above", pinned: true },
];
const plain = { maxPoints: 2, negativeMarking: false };
const negative = { maxPoints: 2, negativeMarking: true };

// Deterministic "random" that walks a fixed sequence.
function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("shared helpers", () => {
  it("keeps pinned options in place when shuffling", () => {
    for (let run = 0; run < 25; run++) {
      const order = orderOptions(options, true, Math.random);
      expect(order[3]).toBe("d");
      expect([...order].sort()).toEqual(["a", "b", "c", "d"]);
    }
  });

  it("does not reorder when shuffle is off", () => {
    expect(orderOptions(options, false, Math.random)).toEqual(["a", "b", "c", "d"]);
  });

  it("computes edit distance", () => {
    expect(levenshtein("photosynthesis", "photosynthesis")).toBe(0);
    expect(levenshtein("photosynthesis", "fotosynthesis")).toBe(2);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("authoring validation", () => {
  it("rejects a key that is not an option", () => {
    const result = parseAuthoredItem("single-choice", { options }, { correctOptionId: "z" });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const result = parseAuthoredItem("single-choice", { options: [options[0], options[0]] }, { correctOptionId: "a" });
    expect(result.ok).toBe(false);
  });

  it("applies scoring defaults", () => {
    const result = parseAuthoredItem("single-choice", { options }, { correctOptionId: "a" });
    expect(result.ok && result.value.scoring).toEqual({ correctOptionId: "a", penalty: 0.25 });
  });

  it("rejects unknown types", () => {
    expect(parseAuthoredItem("hotspot-v9", {}, {}).ok).toBe(false);
  });
});

describe("candidate view", () => {
  it("never leaks the answer key and follows the stored layout", () => {
    const layout = createLayout("single-choice", { options }, true, sequence(0.1, 0.9, 0.5));
    const view = candidateView("single-choice", { options }, layout) as { options: { id: string }[] };
    expect(view.options.map((o) => o.id)).toEqual((layout as { optionOrder: string[] }).optionOrder);
    expect(JSON.stringify(view)).not.toContain("correct");
  });
});

describe("single-choice scoring", () => {
  const item = { interaction: { options }, scoring: { correctOptionId: "a" } };

  it("awards full points for the key", () => {
    expect(scoreItem("single-choice", { ...item, response: { optionId: "a" } }, plain)).toMatchObject({ points: 2, isCorrect: true });
  });

  it("gives zero for a wrong answer without negative marking", () => {
    expect(scoreItem("single-choice", { ...item, response: { optionId: "b" } }, plain)).toMatchObject({ points: 0, isCorrect: false });
  });

  it("deducts the penalty with negative marking", () => {
    expect(scoreItem("single-choice", { ...item, response: { optionId: "b" } }, negative).points).toBe(-0.5);
  });

  it("never penalises an unanswered item", () => {
    expect(scoreItem("single-choice", { ...item, response: null }, negative).points).toBe(0);
  });

  it("treats malformed or unknown option responses as unanswered", () => {
    expect(scoreItem("single-choice", { ...item, response: { optionId: "zzz" } }, negative).points).toBe(0);
    expect(scoreItem("single-choice", { ...item, response: "a" }, negative).points).toBe(0);
  });
});

describe("true-false scoring", () => {
  const item = { interaction: {}, scoring: { correct: "false" } };

  it("scores correctly", () => {
    expect(scoreItem("true-false", { ...item, response: { optionId: "false" } }, plain).points).toBe(2);
    expect(scoreItem("true-false", { ...item, response: { optionId: "true" } }, plain).points).toBe(0);
  });

  it("uses custom labels in the candidate view", () => {
    const view = candidateView("true-false", { trueLabel: "Yes", falseLabel: "No" }, {}) as { options: { text: string }[] };
    expect(view.options.map((o) => o.text)).toEqual(["Yes", "No"]);
  });
});

describe("multiple-response scoring", () => {
  const interaction = { options };
  const correctOptionIds = ["a", "c"];
  const score = (mode: string, optionIds: string[], extra: object = {}) =>
    scoreItem("multiple-response", { interaction: { ...interaction, ...extra }, scoring: { correctOptionIds, mode }, response: { optionIds } }, { maxPoints: 4, negativeMarking: false });

  it("all-or-nothing requires the exact set", () => {
    expect(score("all-or-nothing", ["a", "c"]).points).toBe(4);
    expect(score("all-or-nothing", ["c", "a"]).points).toBe(4);
    expect(score("all-or-nothing", ["a"]).points).toBe(0);
    expect(score("all-or-nothing", ["a", "b", "c"]).points).toBe(0);
  });

  it("partial credit gives a share per correct option", () => {
    expect(score("partial", ["a"]).points).toBe(2);
    expect(score("partial", ["a", "b"]).points).toBe(2);
  });

  it("partial credit gives nothing for selecting every option", () => {
    expect(score("partial", ["a", "b", "c", "d"]).points).toBe(0);
  });

  it("right-minus-wrong subtracts wrong picks and floors at zero", () => {
    expect(score("right-minus-wrong", ["a", "b"]).points).toBe(0);
    expect(score("right-minus-wrong", ["a", "c", "b"]).points).toBe(2);
    expect(score("right-minus-wrong", ["b", "d"]).points).toBe(0);
  });

  it("ignores duplicate ids and zeroes answers over the selection limit", () => {
    expect(score("all-or-nothing", ["a", "a", "c"]).points).toBe(4);
    expect(score("partial", ["a", "c", "b"], { maxSelections: 2 }).points).toBe(0);
  });

  it("validates that correct answers exist", () => {
    expect(parseAuthoredItem("multiple-response", interaction, { correctOptionIds: ["a", "x"] }).ok).toBe(false);
  });
});

describe("short-answer scoring", () => {
  const interaction = {};

  it("matches ignoring case and extra spaces", () => {
    const result = scoreItem("short-answer", { interaction, scoring: { acceptedAnswers: ["Mitochondria"] }, response: { text: "  mitochondria " } }, plain);
    expect(result).toMatchObject({ points: 2, isCorrect: true });
  });

  it("respects case sensitivity", () => {
    const result = scoreItem("short-answer", { interaction, scoring: { acceptedAnswers: ["NaCl"], caseSensitive: true }, response: { text: "nacl" } }, plain);
    expect(result.points).toBe(0);
  });

  it("allows configured typos on longer answers only", () => {
    const scoring = { acceptedAnswers: ["photosynthesis", "cat"], maxTypos: 1 };
    expect(scoreItem("short-answer", { interaction, scoring, response: { text: "photosynthesys" } }, plain).points).toBe(2);
    expect(scoreItem("short-answer", { interaction, scoring, response: { text: "cap" } }, plain).points).toBe(0);
  });

  it("routes unmatched answers to manual grading when configured", () => {
    const result = scoreItem("short-answer", { interaction, scoring: { acceptedAnswers: ["osmosis"], manualReviewUnmatched: true }, response: { text: "diffusion of water" } }, plain);
    expect(result).toMatchObject({ isCorrect: null, needsManualGrading: true, points: 0 });
  });

  it("treats blank text as unanswered", () => {
    expect(isAnswered("short-answer", { text: "   " })).toBe(false);
  });
});
