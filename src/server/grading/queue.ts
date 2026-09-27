import { AttemptStatus, GradeMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { canAnywhere, type Actor } from "../authz";
import { releasesOnGrading } from "../results/release-policy";
import { forbidden, notFound } from "../http";
import { clampPoints, totalsFor } from "./score";

/**
 * Manual grading. Auto-grading flags the items it cannot decide
 * (`ItemGrade.needsManual`); this module is the queue a human works through, and
 * the finalisation that follows the last mark.
 *
 * Marking is organised by question rather than by candidate: one question's
 * answers are marked together, which keeps a marker's standard consistent and is
 * how every marking scheme in practice is applied.
 */

export type GradingGroup = {
  examId: string;
  examTitle: string;
  questionId: string;
  questionText: string;
  typeLabel: string;
  pending: number;
  maxPoints: number;
};

export type GradingItem = {
  id: string;
  attemptId: string;
  /** Null while marking anonymously. */
  candidate: string | null;
  regNumber: string | null;
  questionText: string;
  type: string;
  maxPoints: number;
  response: unknown;
  /** The authored answer key, for the marker to compare against. */
  scoring: unknown;
  explanation: string | null;
  points: number | null;
  comment: string | null;
  graded: boolean;
};

export const gradeItemSchema = z.object({
  points: z.number().min(0).max(1000),
  comment: z.string().trim().max(2000).nullish(),
});
export type GradeItemInput = z.infer<typeof gradeItemSchema>;

function requireGrader(actor: Actor) {
  if (!canAnywhere(actor, "grade:write")) throw forbidden("Only graders and exam officers can mark answers.");
}

function textOf(content: Prisma.JsonValue): string {
  return String((content as { text?: string } | null)?.text ?? "");
}

/**
 * What is waiting to be marked, grouped by exam and question. Counts only
 * submitted attempts: an attempt still in progress has nothing final to mark.
 */
export async function gradingQueue(actor: Actor): Promise<GradingGroup[]> {
  requireGrader(actor);
  const items = await prisma.attemptItem.findMany({
    where: {
      attempt: { status: AttemptStatus.SUBMITTED, exam: { orgId: actor.orgId, deletedAt: null } },
      grade: { needsManual: true },
    },
    select: {
      questionId: true,
      points: true,
      version: { select: { content: true, type: true } },
      attempt: { select: { examId: true, exam: { select: { title: true } } } },
    },
  });

  const groups = new Map<string, GradingGroup>();
  for (const item of items) {
    const key = `${item.attempt.examId}:${item.questionId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.pending += 1;
      existing.maxPoints = Math.max(existing.maxPoints, item.points);
      continue;
    }
    groups.set(key, {
      examId: item.attempt.examId,
      examTitle: item.attempt.exam.title,
      questionId: item.questionId,
      questionText: textOf(item.version.content),
      typeLabel: item.version.type,
      pending: 1,
      maxPoints: item.points,
    });
  }
  return Array.from(groups.values()).sort((a, b) => b.pending - a.pending || a.examTitle.localeCompare(b.examTitle));
}

/**
 * The answers to one question across candidates. `anonymous` withholds names so a
 * marker cannot be swayed by whose script it is; it is the default.
 */
export async function gradingItems(
  actor: Actor,
  examId: string,
  questionId: string,
  options: { anonymous?: boolean; includeGraded?: boolean } = {},
): Promise<GradingItem[]> {
  requireGrader(actor);
  const anonymous = options.anonymous ?? true;
  const items = await prisma.attemptItem.findMany({
    where: {
      questionId,
      attempt: {
        examId,
        exam: { orgId: actor.orgId, deletedAt: null },
        status: options.includeGraded
          ? { in: [AttemptStatus.SUBMITTED, AttemptStatus.GRADED] }
          : AttemptStatus.SUBMITTED,
      },
      ...(options.includeGraded ? {} : { grade: { needsManual: true } }),
    },
    // Stable but not alphabetical: marking in candidate-name order invites
    // comparing neighbours in the register rather than judging each answer.
    orderBy: { id: "asc" },
    select: {
      id: true,
      attemptId: true,
      points: true,
      version: { select: { content: true, type: true, scoring: true, explanation: true } },
      response: { select: { value: true } },
      grade: { select: { points: true, comment: true, needsManual: true } },
      attempt: { select: { user: { select: { name: true, regNumber: true } } } },
    },
  });

  return items.map((item) => ({
    id: item.id,
    attemptId: item.attemptId,
    candidate: anonymous ? null : item.attempt.user.name,
    regNumber: anonymous ? null : item.attempt.user.regNumber,
    questionText: textOf(item.version.content),
    type: item.version.type,
    maxPoints: item.points,
    response: item.response?.value ?? null,
    scoring: item.version.scoring,
    explanation: item.version.explanation,
    points: item.grade?.needsManual ? null : (item.grade?.points ?? null),
    comment: item.grade?.comment ?? null,
    graded: item.grade ? !item.grade.needsManual : false,
  }));
}

/**
 * Record a mark for one answer, then finalise the attempt if that was the last
 * item waiting on a human. Re-marking an item that was already marked is allowed
 * — moderation depends on it — and re-finalises the attempt with the new total.
 */
export async function gradeItem(actor: Actor, attemptItemId: string, input: GradeItemInput) {
  requireGrader(actor);
  const item = await prisma.attemptItem.findFirst({
    where: { id: attemptItemId, attempt: { exam: { orgId: actor.orgId } } },
    select: {
      id: true,
      points: true,
      attemptId: true,
      grade: { select: { points: true, comment: true } },
    },
  });
  if (!item) throw notFound("Answer");

  const points = clampPoints(input.points, item.points);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const data = {
      points,
      maxPoints: item.points,
      // A part-marked answer is neither right nor wrong, so isCorrect is only
      // claimed at the extremes.
      isCorrect: points >= item.points ? true : points <= 0 ? false : null,
      method: GradeMethod.MANUAL,
      graderId: actor.userId,
      comment: input.comment?.trim() || null,
      gradedAt: now,
      needsManual: false,
    };
    await tx.itemGrade.upsert({
      where: { attemptItemId: item.id },
      create: { attemptItemId: item.id, ...data },
      update: data,
    });
    await audit(
      {
        actor,
        action: "grade.item",
        entityType: "attemptItem",
        entityId: item.id,
        before: item.grade ? { points: item.grade.points, comment: item.grade.comment } : null,
        after: { points, comment: data.comment },
      },
      tx,
    );
  });

  const attempt = await finalizeIfComplete(actor, item.attemptId);
  return { points, attempt };
}

/**
 * Totals and closes an attempt once nothing is left for a human to mark. Returns
 * null while marks are still outstanding, so the caller can say how much is left.
 */
export async function finalizeIfComplete(actor: Actor, attemptId: string) {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      id: true,
      maxScore: true,
      status: true,
      releasedAt: true,
      exam: { select: { passMarkPct: true, releasePolicy: true } },
      items: { select: { grade: { select: { points: true, maxPoints: true, needsManual: true } } } },
    },
  });

  const grades = attempt.items.map((i) => i.grade);
  const outstanding = grades.filter((g) => !g || g.needsManual).length;
  if (outstanding > 0) return { status: attempt.status, outstanding };

  const totals = totalsFor(
    grades.map((g) => ({ points: g!.points, maxPoints: g!.maxPoints })),
    attempt.maxScore,
    attempt.exam.passMarkPct,
  );
  const now = new Date();

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      status: AttemptStatus.GRADED,
      score: totals.score,
      percent: totals.percent,
      passed: totals.passed,
      gradedAt: now,
      // A re-mark must not quietly un-release a result that is already out.
      releasedAt:
        attempt.releasedAt ?? (releasesOnGrading(attempt.exam.releasePolicy, false) ? now : null),
    },
  });
  await audit({
    actor,
    action: "grade.finalize",
    entityType: "attempt",
    entityId: attempt.id,
    after: { score: totals.score, percent: totals.percent, passed: totals.passed },
  });

  return { status: AttemptStatus.GRADED, outstanding: 0, ...totals };
}
