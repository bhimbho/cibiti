/**
 * Grading scales and the arithmetic built on them. Pure, because a wrong letter
 * grade or a wrong GPA is the kind of error that reaches a transcript.
 */

export type Band = { label: string; minPercent: number; gradePoint: number };

/**
 * The five-point scale common in Nigerian universities, used until an
 * organisation sets its own. Ordered highest first, as the bands are applied.
 */
export const DEFAULT_BANDS: Band[] = [
  { label: "A", minPercent: 70, gradePoint: 5 },
  { label: "B", minPercent: 60, gradePoint: 4 },
  { label: "C", minPercent: 50, gradePoint: 3 },
  { label: "D", minPercent: 45, gradePoint: 2 },
  { label: "E", minPercent: 40, gradePoint: 1 },
  { label: "F", minPercent: 0, gradePoint: 0 },
];

/** Highest floor first, so the first band a score reaches is the one it earns. */
export function sortBands(bands: Band[]): Band[] {
  return [...bands].sort((a, b) => b.minPercent - a.minPercent);
}

/**
 * The band a percentage falls in, or null when the scale has no band low enough —
 * a gap the settings screen warns about rather than inventing a grade for.
 */
export function gradeFor(percent: number | null, bands: Band[]): Band | null {
  if (percent === null || Number.isNaN(percent)) return null;
  return sortBands(bands).find((band) => percent >= band.minPercent) ?? null;
}

/**
 * Weighted total across a course's assessment components — a 30% CA and a 70%
 * exam, say. Components with no score yet are left out and their weight is
 * dropped, so a total shown mid-term reflects what has actually been sat rather
 * than treating unsat work as zero. `coverage` says how much of the course the
 * number rests on, so a partial total can be labelled as one.
 */
export function weightedTotal(
  parts: { percent: number | null; weightPct: number }[],
): { total: number | null; coverage: number } {
  const scored = parts.filter((p) => p.percent !== null && p.weightPct > 0);
  const coverage = scored.reduce((sum, p) => sum + p.weightPct, 0);
  if (coverage === 0) return { total: null, coverage: 0 };
  const weighted = scored.reduce((sum, p) => sum + (p.percent as number) * p.weightPct, 0);
  return { total: round(weighted / coverage, 2), coverage };
}

/** Grade-point average over courses, weighted by credit units. */
export function gpa(rows: { gradePoint: number | null; credits: number }[]): number | null {
  const counted = rows.filter((r) => r.gradePoint !== null && r.credits > 0);
  const credits = counted.reduce((sum, r) => sum + r.credits, 0);
  if (credits === 0) return null;
  return round(counted.reduce((sum, r) => sum + (r.gradePoint as number) * r.credits, 0) / credits, 2);
}

/**
 * Problems worth showing before a scale is saved: a gap that leaves scores
 * ungraded, or two bands claiming the same floor.
 */
export function scaleProblems(bands: Band[]): string[] {
  const problems: string[] = [];
  if (bands.length === 0) return ["Add at least one band."];
  if (!bands.some((b) => b.minPercent <= 0)) {
    problems.push("No band covers the lowest scores — add one starting at 0%.");
  }
  const floors = new Set<number>();
  for (const band of bands) {
    if (floors.has(band.minPercent)) problems.push(`Two bands both start at ${band.minPercent}%.`);
    floors.add(band.minPercent);
    if (band.minPercent < 0 || band.minPercent > 100) {
      problems.push(`${band.label || "A band"} starts outside 0–100%.`);
    }
  }
  const labels = new Set<string>();
  for (const band of bands) {
    const label = band.label.trim().toUpperCase();
    if (label === "") problems.push("Every band needs a label.");
    else if (labels.has(label)) problems.push(`More than one band is labelled ${band.label}.`);
    labels.add(label);
  }
  return problems;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
