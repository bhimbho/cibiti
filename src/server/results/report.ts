import { AttemptStatus, ReviewDetail } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { itemTypes, reviewItem } from "@/items/registry";
import type { ItemReview } from "@/items/types";
import { audit } from "../audit";
import { canAnywhere, type Actor } from "../authz";
import { forbidden } from "../http";
import { allowsRelease } from "./release-policy";
import { gradeFor } from "../grades/scale";
import { gradeBands } from "../grades/store";

export type AttemptReport = {
  viewer: "staff" | "candidate";
  detail: "SCORE_ONLY" | "BREAKDOWN" | "FULL";
  released: boolean;
  attempt: {
    id: string;
    status: AttemptStatus;
    submissionType: string | null;
    startedAt: string;
    submittedAt: string | null;
    deadlineAt: string | null;
    score: number | null;
    maxScore: number;
    percent: number | null;
    passed: boolean | null;
    ipAddress: string | null;
    userAgent: string | null;
    attemptNo: number;
    /** Staff only: the seed this paper was drawn from, for auditing a dispute. */
    randomSeed: string | null;
  };
  candidate: { name: string; regNumber: string | null; email: string | null };
  exam: { id: string; title: string; passMarkPct: number };
  /** Letter grade from the organisation's scale; null when there is no score yet. */
  grade: string | null;
  sections: { id: string; title: string; score: number; maxScore: number }[];
  items: {
    id: string;
    order: number;
    sectionTitle: string | null;
    text: string;
    assetIds: string[];
    typeLabel: string;
    points: number;
    earned: number | null;
    isCorrect: boolean | null;
    method: string | null;
    explanation: string | null;
    timeSpentSec: number;
    flagged: boolean;
    changeCount: number;
    review: ItemReview;
  }[];
  events: { id: string; type: string; severity: string; serverAt: string; payload: unknown }[];
};

/** Staff with results access see everything; candidates see their own released results at the exam's detail level. */
export async function getAttemptReport(actor: Actor, attemptId: string): Promise<AttemptReport | null> {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, exam: { orgId: actor.orgId } },
    include: {
      user: { select: { name: true, regNumber: true, email: true } },
      exam: { select: { id: true, title: true, passMarkPct: true, reviewDetail: true } },
      items: {
        orderBy: { order: "asc" },
        include: { section: { select: { id: true, title: true } }, version: true, response: true, grade: true },
      },
    },
  });
  if (!attempt) return null;

  const isOwner = attempt.userId === actor.userId;
  const isStaff = canAnywhere(actor, "results:read");
  if (!isOwner && !isStaff) return null;
  const viewer = isStaff && !isOwner ? "staff" : "candidate";

  if (viewer === "candidate" && !attempt.releasedAt) {
    throw forbidden("Your result for this exam has not been released yet.");
  }
  const detail = viewer === "staff" ? ReviewDetail.FULL : attempt.exam.reviewDetail;

  const sectionTotals = new Map<string, { id: string; title: string; score: number; maxScore: number }>();
  for (const item of attempt.items) {
    const key = item.section?.id ?? "none";
    const entry = sectionTotals.get(key) ?? { id: key, title: item.section?.title ?? "Questions", score: 0, maxScore: 0 };
    entry.score += item.grade?.points ?? 0;
    entry.maxScore += item.points;
    sectionTotals.set(key, entry);
  }

  const events =
    viewer === "staff"
      ? await prisma.proctorEvent.findMany({ where: { attemptId }, orderBy: { serverAt: "asc" }, take: 500 })
      : [];

  return {
    viewer,
    detail,
    released: Boolean(attempt.releasedAt),
    attempt: {
      id: attempt.id,
      status: attempt.status,
      submissionType: attempt.submissionType,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      passed: attempt.passed,
      ipAddress: viewer === "staff" ? attempt.ipAddress : null,
      userAgent: viewer === "staff" ? attempt.userAgent : null,
      attemptNo: attempt.attemptNo,
      randomSeed: viewer === "staff" ? attempt.randomSeed : null,
    },
    candidate: { name: attempt.user.name, regNumber: attempt.user.regNumber, email: viewer === "staff" ? attempt.user.email : null },
    exam: { id: attempt.exam.id, title: attempt.exam.title, passMarkPct: attempt.exam.passMarkPct },
    grade: gradeFor(attempt.percent, (await gradeBands(actor.orgId)).bands)?.label ?? null,
    sections: detail === ReviewDetail.SCORE_ONLY ? [] : [...sectionTotals.values()].map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 })),
    items:
      detail !== ReviewDetail.FULL || attempt.status === AttemptStatus.IN_PROGRESS
        ? []
        : attempt.items.map((item) => {
            const content = item.version.content as { text?: string; assetIds?: string[] };
            return {
              id: item.id,
              order: item.order,
              sectionTitle: item.section?.title ?? null,
              text: content.text ?? "",
              assetIds: content.assetIds ?? [],
              typeLabel: itemTypes.get(item.version.type)?.label ?? item.version.type,
              points: item.points,
              earned: item.grade?.points ?? null,
              isCorrect: item.grade?.isCorrect ?? null,
              method: item.grade?.method ?? null,
              explanation: item.version.explanation,
              timeSpentSec: Math.round((item.response?.timeSpentMs ?? 0) / 1000),
              flagged: item.response?.flagged ?? false,
              changeCount: item.response?.changeCount ?? 0,
              review: reviewItem(item.version.type, { interaction: item.version.interaction, scoring: item.version.scoring, response: item.response?.value ?? null }),
            };
          }),
    events: events.map((e) => ({ id: e.id, type: e.type, severity: e.severity, serverAt: e.serverAt.toISOString(), payload: e.payload })),
  };
}

/**
 * Make graded results visible to candidates. Attempts still being marked are
 * skipped, and attempts on an exam set to NEVER are withheld — reported apart
 * from the skipped ones so the caller can say why nothing happened.
 */
export async function releaseResults(actor: Actor, attemptIds: string[]) {
  if (!canAnywhere(actor, "grade:write") && !canAnywhere(actor, "exam:publish")) throw forbidden("Only exam officers and graders can release results.");
  const candidates = await prisma.attempt.findMany({
    where: { id: { in: attemptIds }, exam: { orgId: actor.orgId }, status: AttemptStatus.GRADED, releasedAt: null },
    select: { id: true, exam: { select: { releasePolicy: true } } },
  });
  const attempts = candidates.filter((a) => allowsRelease(a.exam.releasePolicy));
  const withheld = candidates.length - attempts.length;
  const now = new Date();
  await prisma.$transaction([
    prisma.attempt.updateMany({ where: { id: { in: attempts.map((a) => a.id) } }, data: { releasedAt: now } }),
    prisma.auditLog.createMany({
      data: attempts.map((a) => ({ orgId: actor.orgId, actorId: actor.userId, action: "result.release", entityType: "attempt", entityId: a.id, after: { releasedAt: now.toISOString() } })),
    }),
  ]);
  return { released: attempts.length, skipped: attemptIds.length - candidates.length, withheld };
}

/**
 * Takes released results back out of candidates' hands. Used when an exam is set
 * to NEVER after the fact: a policy that only applied to future releases would
 * not be a policy.
 */
export async function withdrawResultsForExam(examId: string, orgId: string, actorId: string | null) {
  const released = await prisma.attempt.findMany({
    where: { examId, exam: { orgId }, releasedAt: { not: null } },
    select: { id: true },
  });
  if (released.length === 0) return { withdrawn: 0 };
  const now = new Date();
  await prisma.$transaction([
    prisma.attempt.updateMany({ where: { id: { in: released.map((a) => a.id) } }, data: { releasedAt: null } }),
    prisma.auditLog.createMany({
      data: released.map((a) => ({ orgId, actorId, action: "result.withdraw", entityType: "attempt", entityId: a.id, after: { releasedAt: null, at: now.toISOString() } })),
    }),
  ]);
  return { withdrawn: released.length };
}

export async function releaseAllForExam(actor: Actor, examId: string) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, orgId: actor.orgId }, select: { releasePolicy: true } });
  if (exam && !allowsRelease(exam.releasePolicy)) {
    throw forbidden("This exam is set never to show results to candidates. Change its release policy first.");
  }
  const ids = await prisma.attempt.findMany({ where: { examId, exam: { orgId: actor.orgId }, status: AttemptStatus.GRADED, releasedAt: null }, select: { id: true } });
  await audit({ actor, action: "exam.release-results", entityType: "exam", entityId: examId, after: { count: ids.length } });
  return releaseResults(actor, ids.map((i) => i.id));
}
