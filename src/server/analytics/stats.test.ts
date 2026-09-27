import { describe, expect, it } from "vitest";
import {
  correlation,
  cronbachAlpha,
  cutScoreCurve,
  difficultyIndex,
  discrimination,
  distribution,
  itemVerdict,
  mean,
  median,
  standardDeviation,
  standardError,
  upperLowerDiscrimination,
} from "./stats";

describe("descriptive statistics", () => {
  it("averages a set of scores", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
  });

  it("takes the middle value, averaging the pair when even", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("computes the population standard deviation", () => {
    // Mean 5, squared deviations 9,1,1,9 → variance 5.
    expect(standardDeviation([2, 4, 6, 8])).toBeCloseTo(Math.sqrt(5), 10);
    expect(standardDeviation([3, 3, 3])).toBe(0);
  });
});

describe("correlation", () => {
  it("is 1 for a perfectly rising pair", () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBe(1);
  });

  it("is -1 for a perfectly falling pair", () => {
    expect(correlation([1, 2, 3], [6, 4, 2])).toBe(-1);
  });

  it("is undefined when one side never varies", () => {
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("cronbachAlpha", () => {
  it("is high when candidates score consistently across questions", () => {
    // Strong candidates get everything, weak candidates get nothing.
    const matrix = [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(cronbachAlpha(matrix)).toBe(1);
  });

  it("is low when the questions disagree with each other", () => {
    // Totals vary, but no question agrees with the others about who is strong.
    const matrix = [
      [1, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ];
    const alpha = cronbachAlpha(matrix);
    expect(alpha).not.toBeNull();
    expect(alpha!).toBeLessThan(0.5);
  });

  it("refuses a verdict on a single question or a single candidate", () => {
    expect(cronbachAlpha([[1], [0]])).toBeNull();
    expect(cronbachAlpha([[1, 0, 1]])).toBeNull();
  });

  it("refuses a verdict when every candidate scored the same total", () => {
    expect(cronbachAlpha([[1, 0], [1, 0], [0, 1]])).toBeNull();
  });
});

describe("standardError", () => {
  it("shrinks as reliability rises", () => {
    const percentages = [40, 55, 60, 75, 90];
    const loose = standardError(percentages, 0.5)!;
    const tight = standardError(percentages, 0.9)!;
    expect(tight).toBeLessThan(loose);
  });

  it("is zero for a perfectly reliable paper", () => {
    expect(standardError([40, 60, 80], 1)).toBe(0);
  });

  it("has no meaning without a usable alpha", () => {
    expect(standardError([40, 60], null)).toBeNull();
    expect(standardError([40, 60], -0.3)).toBeNull();
  });
});

describe("difficultyIndex", () => {
  it("reports the share of the marks the cohort earned", () => {
    expect(difficultyIndex([2, 1, 0, 1], 2)).toBe(0.5);
    expect(difficultyIndex([4, 4], 4)).toBe(1);
  });

  it("has no value without candidates or marks", () => {
    expect(difficultyIndex([], 2)).toBeNull();
    expect(difficultyIndex([1, 2], 0)).toBeNull();
  });
});

describe("discrimination", () => {
  // A clean ability gradient: each candidate answers one fewer question than the last.
  const gradient = [
    [1, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  // Question 3 here is answered by exactly the candidates who scored worst.
  const wrongKey = [
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 0, 1],
  ];

  it("is positive for a question the stronger candidates get right", () => {
    expect(discrimination(gradient, 0)!).toBeGreaterThan(0.4);
  });

  it("is negative for a question the stronger candidates get wrong", () => {
    expect(discrimination(wrongKey, 3)!).toBeLessThan(0);
  });

  it("excludes the item itself, so a lone question cannot self-correlate", () => {
    expect(discrimination([[1, 0], [0, 0], [1, 0]], 1)).toBeNull();
  });

  it("needs at least three candidates", () => {
    expect(discrimination([[1, 1], [0, 0]], 0)).toBeNull();
  });
});

describe("upperLowerDiscrimination", () => {
  it("compares the strongest and weakest quarters", () => {
    const matrix = [
      [1, 1],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    // Top 27% of 4 ≈ 1 candidate: scored 1; bottom 1: scored 0.
    expect(upperLowerDiscrimination(matrix, 0, 1)).toBe(1);
  });

  it("is zero when both groups do equally well", () => {
    const matrix = [
      [1, 1],
      [1, 1],
      [1, 0],
      [1, 0],
    ];
    expect(upperLowerDiscrimination(matrix, 0, 1)).toBe(0);
  });

  it("needs a cohort worth splitting", () => {
    expect(upperLowerDiscrimination([[1], [0], [1]], 0, 1)).toBeNull();
  });
});

describe("distribution", () => {
  it("buckets percentages into ten bands", () => {
    const bands = distribution([0, 5, 45, 99, 100]);
    expect(bands[0].count).toBe(2);
    expect(bands[4].count).toBe(1);
    // 100% belongs in the top band rather than an eleventh one.
    expect(bands[9]).toMatchObject({ label: "90–100", count: 2 });
    expect(bands).toHaveLength(10);
  });

  it("is all zeroes for no candidates", () => {
    expect(distribution([]).every((b) => b.count === 0)).toBe(true);
  });
});

describe("cutScoreCurve", () => {
  it("shows how many pass at each candidate cut", () => {
    expect(cutScoreCurve([30, 50, 70, 90], [40, 50, 80])).toEqual([
      { cut: 40, passed: 3, rate: 75 },
      { cut: 50, passed: 3, rate: 75 },
      { cut: 80, passed: 1, rate: 25 },
    ]);
  });

  it("reports a zero rate rather than dividing by nobody", () => {
    expect(cutScoreCurve([], [50])).toEqual([{ cut: 50, passed: 0, rate: 0 }]);
  });
});

describe("itemVerdict", () => {
  it("calls out a probable wrong key before anything else", () => {
    expect(itemVerdict(0.5, -0.4)).toMatch(/answer key/i);
  });

  it("flags questions everyone gets right and questions almost nobody does", () => {
    expect(itemVerdict(0.98, 0.05)).toMatch(/separates nobody/i);
    expect(itemVerdict(0.1, 0.4)).toMatch(/very hard/i);
  });

  it("flags weak discrimination and passes a healthy item", () => {
    expect(itemVerdict(0.6, 0.02)).toMatch(/weak discrimination/i);
    expect(itemVerdict(0.6, 0.45)).toBe("Healthy");
  });

  it("says so when there is nothing to judge", () => {
    expect(itemVerdict(null, null)).toBe("Not enough data");
  });
});
