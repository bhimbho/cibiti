/**
 * Pure arithmetic for finalising a hand-marked attempt. Kept out of the query
 * layer so the rounding and pass/fail rules can be tested directly — they decide
 * whether a candidate passed, which is not something to infer from a UI.
 */

export type GradedItem = { points: number; maxPoints: number };

export type AttemptTotals = { score: number; percent: number; passed: boolean };

/**
 * Totals an attempt from its item grades. Negative marking can push the raw sum
 * below zero; an exam score never goes negative, matching auto-grading.
 */
export function totalsFor(items: GradedItem[], maxScore: number, passMarkPct: number): AttemptTotals {
  const raw = items.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.round(raw * 1000) / 1000);
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
  return { score, percent, passed: percent >= passMarkPct };
}

/** Marks are bounded by the question's allocation; a typo cannot award 500 of 5. */
export function clampPoints(points: number, maxPoints: number): number {
  if (Number.isNaN(points)) return 0;
  return Math.max(0, Math.min(maxPoints, Math.round(points * 1000) / 1000));
}
