import { AttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAnywhere, type Actor } from "../authz";
import { forbidden, notFound } from "../http";
import { gradeFor, gpa, weightedTotal, type Band } from "./scale";
import { gradeBands } from "./store";

/**
 * A course broadsheet: every registered candidate as a row, every assessment
 * component as a column, weighted into a final mark and a grade.
 *
 * Marks come from the best graded attempt a candidate has on the component's
 * exam. Best rather than latest, because a resit is an opportunity, not a
 * penalty — and an attempt still being marked contributes nothing rather than a
 * zero that would read as a fail.
 */

export type BroadsheetColumn = { id: string; name: string; weightPct: number; examId: string | null };

export type BroadsheetRow = {
  userId: string;
  candidate: string;
  regNumber: string | null;
  /** Percentage per component, in the same order as the columns; null when unsat. */
  parts: (number | null)[];
  total: number | null;
  /** Share of the course's weight the total rests on — under 100 means unsat work. */
  coverage: number;
  grade: string | null;
  gradePoint: number | null;
};

export type Broadsheet = {
  course: { id: string; code: string; title: string; credits: number };
  columns: BroadsheetColumn[];
  /** True when no components are configured and the course's exams stand in. */
  inferredColumns: boolean;
  rows: BroadsheetRow[];
  summary: { candidates: number; withMarks: number; mean: number | null; passRate: number | null; gpa: number | null };
  bands: Band[];
};

export async function courseBroadsheet(actor: Actor, courseId: string): Promise<Broadsheet> {
  if (!canAnywhere(actor, "results:read")) throw forbidden("You don't have permission to view results.");

  const course = await prisma.course.findFirst({
    where: { id: courseId, orgId: actor.orgId },
    select: {
      id: true,
      code: true,
      title: true,
      credits: true,
      components: { orderBy: { name: "asc" }, select: { id: true, name: true, weightPct: true, examId: true } },
      exams: { where: { deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } },
      enrollments: {
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true, regNumber: true } } },
      },
    },
  });
  if (!course) throw notFound("Course");

  // With no components configured, the course's exams stand in with equal weight,
  // so a broadsheet is readable before anybody sets the CA/exam split up.
  const inferredColumns = course.components.length === 0;
  const columns: BroadsheetColumn[] = inferredColumns
    ? course.exams.map((exam, index) => ({
        id: `exam-${exam.id}`,
        name: exam.title,
        weightPct: equalWeight(course.exams.length, index),
        examId: exam.id,
      }))
    : course.components.map((c) => ({ id: c.id, name: c.name, weightPct: c.weightPct, examId: c.examId }));

  const examIds = columns.map((c) => c.examId).filter((id): id is string => Boolean(id));
  const userIds = course.enrollments.map((e) => e.user.id);

  const [attempts, scale] = await Promise.all([
    examIds.length > 0 && userIds.length > 0
      ? prisma.attempt.findMany({
          where: { examId: { in: examIds }, userId: { in: userIds }, status: AttemptStatus.GRADED },
          select: { examId: true, userId: true, percent: true },
        })
      : Promise.resolve([]),
    gradeBands(actor.orgId),
  ]);

  // Best graded attempt per candidate per exam.
  const best = new Map<string, number>();
  for (const attempt of attempts) {
    const key = `${attempt.userId}:${attempt.examId}`;
    const percent = attempt.percent ?? 0;
    if (!best.has(key) || percent > best.get(key)!) best.set(key, percent);
  }

  const rows: BroadsheetRow[] = course.enrollments.map(({ user }) => {
    const parts = columns.map((column) =>
      column.examId ? (best.get(`${user.id}:${column.examId}`) ?? null) : null,
    );
    const { total, coverage } = weightedTotal(
      parts.map((percent, index) => ({ percent, weightPct: columns[index].weightPct })),
    );
    const band = gradeFor(total, scale.bands);
    return {
      userId: user.id,
      candidate: user.name,
      regNumber: user.regNumber,
      parts,
      total,
      coverage,
      grade: band?.label ?? null,
      gradePoint: band?.gradePoint ?? null,
    };
  });

  const totals = rows.map((r) => r.total).filter((t): t is number => t !== null);
  const passBand = lowestPassingBand(scale.bands);

  return {
    course: { id: course.id, code: course.code, title: course.title, credits: course.credits },
    columns,
    inferredColumns,
    rows,
    summary: {
      candidates: rows.length,
      withMarks: totals.length,
      mean: totals.length ? round(totals.reduce((sum, t) => sum + t, 0) / totals.length, 2) : null,
      passRate:
        totals.length && passBand
          ? round((totals.filter((t) => t >= passBand.minPercent).length / totals.length) * 100, 1)
          : null,
      gpa: gpa(rows.map((r) => ({ gradePoint: r.gradePoint, credits: course.credits }))),
    },
    bands: scale.bands,
  };
}

/** Spreads 100 across n columns without losing a point to rounding. */
function equalWeight(count: number, index: number): number {
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return base + (index < remainder ? 1 : 0);
}

/** The lowest band that still earns grade points — the pass line of the scale. */
function lowestPassingBand(bands: Band[]): Band | null {
  const passing = bands.filter((b) => b.gradePoint > 0);
  if (passing.length === 0) return null;
  return passing.reduce((lowest, band) => (band.minPercent < lowest.minPercent ? band : lowest));
}

/** The broadsheet as CSV: the form a registry actually files. */
export function broadsheetCsvRows(sheet: Broadsheet): (string | number | null)[][] {
  const header = [
    "Candidate",
    "Matric number",
    ...sheet.columns.map((c) => `${c.name} (${c.weightPct}%)`),
    "Total (%)",
    "Grade",
    "Grade point",
  ];
  const rows = sheet.rows.map((row) => [
    row.candidate,
    row.regNumber ?? "",
    ...row.parts.map((part) => (part === null ? "" : round(part, 2))),
    row.total === null ? "" : row.total,
    row.grade ?? "",
    row.gradePoint ?? "",
  ]);
  return [header, ...rows];
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
