import { describe, expect, it } from "vitest";
import { clampPoints, totalsFor } from "./score";

describe("totalsFor", () => {
  it("sums item marks into a score and percentage", () => {
    const totals = totalsFor([{ points: 3, maxPoints: 4 }, { points: 5, maxPoints: 6 }], 10, 50);
    expect(totals).toEqual({ score: 8, percent: 80, passed: true });
  });

  it("fails an attempt below the pass mark", () => {
    expect(totalsFor([{ points: 4, maxPoints: 10 }], 10, 50)).toMatchObject({ percent: 40, passed: false });
  });

  it("passes exactly on the pass mark", () => {
    expect(totalsFor([{ points: 5, maxPoints: 10 }], 10, 50).passed).toBe(true);
  });

  it("never reports a negative score, even with negative marking", () => {
    expect(totalsFor([{ points: -3, maxPoints: 2 }], 10, 50)).toMatchObject({ score: 0, percent: 0 });
  });

  it("treats a zero-mark exam as 0% rather than dividing by zero", () => {
    expect(totalsFor([], 0, 50).percent).toBe(0);
  });

  it("rounds a repeating percentage to two places", () => {
    expect(totalsFor([{ points: 1, maxPoints: 3 }], 3, 50).percent).toBe(33.33);
  });
});

describe("clampPoints", () => {
  it("keeps a mark within the question's allocation", () => {
    expect(clampPoints(500, 5)).toBe(5);
    expect(clampPoints(-2, 5)).toBe(0);
    expect(clampPoints(2.5, 5)).toBe(2.5);
  });

  it("rounds to three decimals and treats NaN as zero", () => {
    expect(clampPoints(1.23456, 5)).toBe(1.235);
    expect(clampPoints(Number.NaN, 5)).toBe(0);
  });
});
