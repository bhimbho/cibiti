/**
 * Psychometrics for a finished exam. Pure functions over score matrices, so the
 * formulas can be checked against worked examples — these numbers decide whether
 * a question gets rewritten or a paper gets re-cut, and a silently wrong
 * discrimination index is worse than none at all.
 *
 * Conventions: one row per candidate, one column per question, points earned.
 */

export type ScoreMatrix = number[][];

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population standard deviation: the cohort that sat the exam *is* the population. */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * Cronbach's alpha (KR-20 for right/wrong items): how consistently the questions
 * measure the same thing. Undefined for fewer than two questions, and for a
 * cohort so small or uniform that no variance exists — reported as null rather
 * than a confident zero.
 */
export function cronbachAlpha(matrix: ScoreMatrix): number | null {
  const candidates = matrix.length;
  const items = matrix[0]?.length ?? 0;
  if (items < 2 || candidates < 2) return null;

  const totals = matrix.map((row) => row.reduce((sum, v) => sum + v, 0));
  const totalVariance = standardDeviation(totals) ** 2;
  if (totalVariance === 0) return null;

  let itemVarianceSum = 0;
  for (let i = 0; i < items; i++) {
    itemVarianceSum += standardDeviation(matrix.map((row) => row[i])) ** 2;
  }

  const alpha = (items / (items - 1)) * (1 - itemVarianceSum / totalVariance);
  return round(alpha, 3);
}

/**
 * Standard error of measurement, in percentage points: how much a candidate's
 * score would wobble on a retake. Null whenever alpha is.
 */
export function standardError(percentages: number[], alpha: number | null): number | null {
  if (alpha === null) return null;
  // A negative alpha (an internally inconsistent paper) has no meaningful SEM.
  if (alpha > 1 || alpha < 0) return null;
  return round(standardDeviation(percentages) * Math.sqrt(1 - alpha), 2);
}

/** Difficulty as the proportion of the marks available that the cohort earned.
 *  High is easy: 0.9 means the cohort scored 90% on it. */
export function difficultyIndex(itemScores: number[], maxPoints: number): number | null {
  if (itemScores.length === 0 || maxPoints <= 0) return null;
  return round(mean(itemScores) / maxPoints, 3);
}

/**
 * Discrimination as a point-biserial-style correlation between the mark on this
 * question and the total on the rest of the paper. Correlating against the total
 * *including* this question inflates every value, so the item is excluded.
 *
 * Above 0.3 is good; near zero means the question separates nobody; negative
 * means the stronger candidates got it wrong, which usually points at a wrong key.
 */
export function discrimination(matrix: ScoreMatrix, itemIndex: number): number | null {
  if (matrix.length < 3) return null;
  const itemScores = matrix.map((row) => row[itemIndex] ?? 0);
  const restTotals = matrix.map((row) => row.reduce((sum, v, i) => (i === itemIndex ? sum : sum + v), 0));
  return correlation(itemScores, restTotals);
}

export function correlation(xs: number[], ys: number[]): number | null {
  const sdX = standardDeviation(xs);
  const sdY = standardDeviation(ys);
  if (sdX === 0 || sdY === 0) return null;
  const mX = mean(xs);
  const mY = mean(ys);
  const covariance = mean(xs.map((x, i) => (x - mX) * (ys[i] - mY)));
  return round(covariance / (sdX * sdY), 3);
}

/**
 * The classic upper/lower group index: the top 27% minus the bottom 27% by total
 * score. Coarser than the correlation but easier to defend to a committee, and
 * it is the number most exam boards ask for.
 */
export function upperLowerDiscrimination(matrix: ScoreMatrix, itemIndex: number, maxPoints: number): number | null {
  if (matrix.length < 4 || maxPoints <= 0) return null;
  const ranked = matrix
    .map((row) => ({ item: row[itemIndex] ?? 0, total: row.reduce((sum, v) => sum + v, 0) }))
    .sort((a, b) => b.total - a.total);
  const groupSize = Math.max(1, Math.round(ranked.length * 0.27));
  const upper = mean(ranked.slice(0, groupSize).map((r) => r.item));
  const lower = mean(ranked.slice(-groupSize).map((r) => r.item));
  return round((upper - lower) / maxPoints, 3);
}

export type Band = { label: string; from: number; to: number; count: number };

/** Ten-point bands for the score distribution; 100% belongs in the top band. */
export function distribution(percentages: number[]): Band[] {
  const bands: Band[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i * 10 + 9}`,
    from: i * 10,
    to: i * 10 + 9,
    count: 0,
  }));
  bands[9] = { label: "90–100", from: 90, to: 100, count: 0 };
  for (const percent of percentages) {
    const index = Math.min(9, Math.max(0, Math.floor(percent / 10)));
    bands[index].count += 1;
  }
  return bands;
}

/**
 * How many candidates would pass at each cut score, so a board can see the cost
 * of moving the line before they move it.
 */
export function cutScoreCurve(percentages: number[], cuts: number[]): { cut: number; passed: number; rate: number }[] {
  return cuts.map((cut) => {
    const passed = percentages.filter((p) => p >= cut).length;
    return { cut, passed, rate: percentages.length === 0 ? 0 : round((passed / percentages.length) * 100, 1) };
  });
}

/** A plain reading of an item's numbers, so the table says what to do about it. */
export function itemVerdict(difficulty: number | null, disc: number | null): string {
  if (difficulty === null) return "Not enough data";
  if (disc !== null && disc < 0) return "Check the answer key — stronger candidates got it wrong";
  if (difficulty >= 0.95) return "Almost everyone passed it; it separates nobody";
  if (difficulty <= 0.2) return "Very hard; check the wording and the key";
  if (disc !== null && disc < 0.1) return "Weak discrimination; consider rewriting";
  return "Healthy";
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
