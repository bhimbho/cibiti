import { describe, expect, it } from "vitest";
import { weightProblems } from "./component-weights";

describe("weightProblems", () => {
  it("accepts weights that add to 100", () => {
    expect(weightProblems([{ name: "CA", weightPct: 30 }, { name: "Exam", weightPct: 70 }])).toEqual([]);
  });

  it("rejects weights that do not, naming the total", () => {
    expect(weightProblems([{ name: "CA", weightPct: 30 }, { name: "Exam", weightPct: 60 }])).toEqual([
      "Weights add up to 90%, not 100%.",
    ]);
  });

  it("rejects a repeated component name, whatever its case", () => {
    expect(weightProblems([{ name: "Exam", weightPct: 50 }, { name: "exam", weightPct: 50 }])).toContainEqual(
      expect.stringMatching(/more than one component/i),
    );
  });

  it("has nothing to say about a course with no components yet", () => {
    expect(weightProblems([])).toEqual([]);
  });
});
