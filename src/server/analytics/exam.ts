import { AttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAnywhere, type Actor } from "../authz";
import { forbidden } from "../http";
import {
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
  round,
  type Band,
} from "./stats";

/**
 * Exam statistics and item analysis, assembled from graded attempts.
 *
 * Only graded attempts count: an attempt still being marked has no final score,
 * and including it would drag every average down and quietly misreport the paper.
 * The questions considered are those every counted attempt actually saw — a
 * randomly drawn question answered by a fraction of the cohort cannot be compared
 * with one everybody sat, so it is reported separately rather than mixed in.
 */

export type ItemAnalysis = {
  questionId: string;
  text: string;
  type: string;
  maxPoints: number;
  responses: number;
  difficulty: number | null;
  discrimination: number | null;
  upperLower: number | null;
  /** Share of candidates who earned every mark available. */
  fullMarks: number | null;
  verdict: string;
  /** True when only some of the cohort saw it (a random draw), so it sits apart. */
  partialCohort: boolean;
};

export type ExamAnalytics = {
  exam: { id: string; title: string; passMarkPct: number; maxScore: number };
  counted: number;
  awaitingMarking: number;
  summary: {
    mean: number;
    median: number;
    standardDeviation: number;
    highest: number;
    lowest: number;
    passRate: number;
    alpha: number | null;
    standardError: number | null;
  };
  distribution: Band[];
  cutScores: { cut: number; passed: number; rate: number }[];
  items: ItemAnalysis[];
};

export async function examAnalytics(actor: Actor, examId: string): Promise<ExamAnalytics | null> {
  if (!canAnywhere(actor, "results:read")) throw forbidden("You don't have permission to view results.");

  const exam = await prisma.exam.findFirst({
    where: { id: examId, orgId: actor.orgId, deletedAt: null },
    select: { id: true, title: true, passMarkPct: true },
  });
  if (!exam) return null;

  const [attempts, awaitingMarking] = await Promise.all([
    prisma.attempt.findMany({
      where: { examId, status: AttemptStatus.GRADED },
      select: {
        id: true,
        percent: true,
        maxScore: true,
        items: {
          select: {
            questionId: true,
            points: true,
            version: { select: { content: true, type: true } },
            grade: { select: { points: true, maxPoints: true } },
          },
        },
      },
    }),
    prisma.attempt.count({ where: { examId, status: AttemptStatus.SUBMITTED } }),
  ]);

  const percentages = attempts.map((a) => a.percent ?? 0);
  const alpha = alphaFor(attempts);

  // Questions in the order they were authored into the paper, deduplicated across
  // attempts (a random draw gives different candidates different questions).
  const seen = new Map<string, { text: string; type: string; maxPoints: number; scores: number[] }>();
  for (const attempt of attempts) {
    for (const item of attempt.items) {
      const entry = seen.get(item.questionId) ?? {
        text: String((item.version.content as { text?: string } | null)?.text ?? ""),
        type: item.version.type,
        maxPoints: item.points,
        scores: [],
      };
      entry.scores.push(item.grade?.points ?? 0);
      entry.maxPoints = Math.max(entry.maxPoints, item.points);
      seen.set(item.questionId, entry);
    }
  }

  const items: ItemAnalysis[] = Array.from(seen.entries()).map(([questionId, entry]) => {
    // Discrimination needs each candidate's mark on this question beside their
    // total, so the matrix is built from the attempts that actually saw it.
    const cohort = attempts.filter((a) => a.items.some((i) => i.questionId === questionId));
    const matrix = cohort.map((a) => {
      const mine = a.items.find((i) => i.questionId === questionId);
      const rest = a.items.filter((i) => i.questionId !== questionId).reduce((sum, i) => sum + (i.grade?.points ?? 0), 0);
      return [mine?.grade?.points ?? 0, rest];
    });

    const difficulty = difficultyIndex(entry.scores, entry.maxPoints);
    const disc = discrimination(matrix, 0);
    return {
      questionId,
      text: entry.text,
      type: entry.type,
      maxPoints: entry.maxPoints,
      responses: entry.scores.length,
      difficulty,
      discrimination: disc,
      upperLower: upperLowerDiscrimination(matrix, 0, entry.maxPoints),
      fullMarks:
        entry.scores.length === 0
          ? null
          : round((entry.scores.filter((s) => s >= entry.maxPoints).length / entry.scores.length) * 100, 1),
      verdict: itemVerdict(difficulty, disc),
      partialCohort: entry.scores.length < attempts.length,
    };
  });

  return {
    exam: { ...exam, maxScore: attempts[0]?.maxScore ?? 0 },
    counted: attempts.length,
    awaitingMarking,
    summary: {
      mean: round(mean(percentages), 1),
      median: round(median(percentages), 1),
      standardDeviation: round(standardDeviation(percentages), 1),
      highest: percentages.length ? round(Math.max(...percentages), 1) : 0,
      lowest: percentages.length ? round(Math.min(...percentages), 1) : 0,
      passRate: percentages.length
        ? round((percentages.filter((p) => p >= exam.passMarkPct).length / percentages.length) * 100, 1)
        : 0,
      alpha,
      standardError: standardError(percentages, alpha),
    },
    distribution: distribution(percentages),
    // Bracketing the exam's own pass mark, so a board sees what moving it costs.
    cutScores: cutScoreCurve(
      percentages,
      Array.from(new Set([exam.passMarkPct - 10, exam.passMarkPct - 5, exam.passMarkPct, exam.passMarkPct + 5, exam.passMarkPct + 10]))
        .filter((cut) => cut >= 0 && cut <= 100)
        .sort((a, b) => a - b),
    ),
    items: items.sort((a, b) => (a.difficulty ?? 1) - (b.difficulty ?? 1)),
  };
}

/**
 * Reliability is only meaningful over one common set of questions, so it is
 * computed from the questions every counted attempt saw. A paper built entirely
 * from random draws therefore reports no alpha rather than a misleading one.
 */
function alphaFor(
  attempts: { items: { questionId: string; grade: { points: number } | null }[] }[],
): number | null {
  if (attempts.length < 2) return null;
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    for (const item of attempt.items) counts.set(item.questionId, (counts.get(item.questionId) ?? 0) + 1);
  }
  const common = Array.from(counts.entries())
    .filter(([, count]) => count === attempts.length)
    .map(([questionId]) => questionId);
  if (common.length < 2) return null;

  const matrix = attempts.map((attempt) =>
    common.map((questionId) => attempt.items.find((i) => i.questionId === questionId)?.grade?.points ?? 0),
  );
  return cronbachAlpha(matrix);
}
