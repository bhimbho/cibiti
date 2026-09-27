import { describe, expect, it } from "vitest";
import { DEFAULT_BANDS, gpa, gradeFor, scaleProblems, sortBands, weightedTotal, type Band } from "./scale";

describe("gradeFor", () => {
  it("awards the band a score reaches", () => {
    expect(gradeFor(85, DEFAULT_BANDS)?.label).toBe("A");
    expect(gradeFor(60, DEFAULT_BANDS)?.label).toBe("B");
    expect(gradeFor(49.9, DEFAULT_BANDS)?.label).toBe("D");
    expect(gradeFor(0, DEFAULT_BANDS)?.label).toBe("F");
  });

  it("treats a band floor as inclusive", () => {
    expect(gradeFor(70, DEFAULT_BANDS)?.label).toBe("A");
    expect(gradeFor(69.99, DEFAULT_BANDS)?.label).toBe("B");
  });

  it("works whatever order the bands arrive in", () => {
    const shuffled = [...DEFAULT_BANDS].reverse();
    expect(gradeFor(75, shuffled)?.label).toBe("A");
  });

  it("has no grade for a missing score", () => {
    expect(gradeFor(null, DEFAULT_BANDS)).toBeNull();
  });

  it("returns nothing rather than inventing a grade when the scale has a hole", () => {
    const partial: Band[] = [{ label: "A", minPercent: 70, gradePoint: 5 }];
    expect(gradeFor(40, partial)).toBeNull();
  });
});

describe("sortBands", () => {
  it("orders by floor, highest first, without mutating the input", () => {
    const input: Band[] = [
      { label: "C", minPercent: 50, gradePoint: 3 },
      { label: "A", minPercent: 70, gradePoint: 5 },
    ];
    expect(sortBands(input).map((b) => b.label)).toEqual(["A", "C"]);
    expect(input[0].label).toBe("C");
  });
});

describe("weightedTotal", () => {
  it("weights each component by its share of the course", () => {
    const result = weightedTotal([
      { percent: 80, weightPct: 30 },
      { percent: 50, weightPct: 70 },
    ]);
    // (80·30 + 50·70) / 100 = 59.
    expect(result).toEqual({ total: 59, coverage: 100 });
  });

  it("drops the weight of work not yet sat, and says how much is covered", () => {
    const result = weightedTotal([
      { percent: 80, weightPct: 30 },
      { percent: null, weightPct: 70 },
    ]);
    expect(result).toEqual({ total: 80, coverage: 30 });
  });

  it("has no total when nothing has been sat", () => {
    expect(weightedTotal([{ percent: null, weightPct: 100 }])).toEqual({ total: null, coverage: 0 });
  });

  it("ignores a component carrying no weight", () => {
    expect(weightedTotal([{ percent: 90, weightPct: 0 }, { percent: 40, weightPct: 100 }])).toEqual({
      total: 40,
      coverage: 100,
    });
  });
});

describe("gpa", () => {
  it("weights grade points by credit units", () => {
    // (5·3 + 3·1) / 4 = 4.5.
    expect(gpa([{ gradePoint: 5, credits: 3 }, { gradePoint: 3, credits: 1 }])).toBe(4.5);
  });

  it("skips courses with no grade or no credits", () => {
    expect(gpa([{ gradePoint: null, credits: 3 }, { gradePoint: 4, credits: 2 }])).toBe(4);
    expect(gpa([{ gradePoint: 4, credits: 0 }])).toBeNull();
  });

  it("has no value with nothing graded", () => {
    expect(gpa([])).toBeNull();
  });
});

describe("scaleProblems", () => {
  it("passes a complete scale", () => {
    expect(scaleProblems(DEFAULT_BANDS)).toEqual([]);
  });

  it("catches a scale that leaves the lowest scores ungraded", () => {
    expect(scaleProblems([{ label: "A", minPercent: 70, gradePoint: 5 }])).toContainEqual(
      expect.stringMatching(/lowest scores/i),
    );
  });

  it("catches duplicate floors, duplicate labels and empty labels", () => {
    const problems = scaleProblems([
      { label: "A", minPercent: 70, gradePoint: 5 },
      { label: "A", minPercent: 70, gradePoint: 4 },
      { label: "", minPercent: 0, gradePoint: 0 },
    ]);
    expect(problems).toContainEqual(expect.stringMatching(/both start at 70/i));
    expect(problems).toContainEqual(expect.stringMatching(/labelled A/i));
    expect(problems).toContainEqual(expect.stringMatching(/needs a label/i));
  });

  it("catches a floor outside the percentage range", () => {
    expect(scaleProblems([{ label: "A", minPercent: 140, gradePoint: 5 }, { label: "F", minPercent: 0, gradePoint: 0 }])).toContainEqual(
      expect.stringMatching(/outside 0–100/i),
    );
  });

  it("asks for at least one band", () => {
    expect(scaleProblems([])).toEqual(["Add at least one band."]);
  });
});
