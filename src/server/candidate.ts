import { AttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./authz";
import { eligibleExamsWhere } from "./eligibility";

export type CandidateExam = {
  id: string;
  title: string;
  description: string | null;
  course: string | null;
  questionCount: number;
  timeLimitMin: number | null;
  attemptsUsed: number;
  maxAttempts: number;
  inProgress: boolean;
  nextSitting: { startsAt: string; endsAt: string; open: boolean } | null;
};

export async function candidateOverview(actor: Actor) {
  const now = new Date();
  const [exams, attempts] = await Promise.all([
    prisma.exam.findMany({
      where: eligibleExamsWhere(actor.userId, actor.orgId),
      orderBy: { publishedAt: "desc" },
      include: {
        course: { select: { code: true } },
        sections: { select: { _count: { select: { items: true } }, rules: { select: { count: true } } } },
        sessions: { where: { endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 1 },
        _count: { select: { sessions: true } },
      },
    }),
    prisma.attempt.findMany({
      where: { userId: actor.userId },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { exam: { select: { title: true } } },
    }),
  ]);

  const byExam = new Map<string, typeof attempts>();
  for (const attempt of attempts) byExam.set(attempt.examId, [...(byExam.get(attempt.examId) ?? []), attempt]);

  const available: CandidateExam[] = exams
    // Exams with sittings disappear once every sitting has ended.
    .filter((exam) => exam._count.sessions === 0 || exam.sessions.length > 0)
    .map((exam) => {
      const mine = byExam.get(exam.id) ?? [];
      const sitting = exam.sessions[0];
      return {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        course: exam.course?.code ?? null,
        questionCount: exam.sections.reduce((sum, s) => sum + s._count.items + s.rules.reduce((r, rule) => r + rule.count, 0), 0),
        timeLimitMin: exam.timeLimitMin,
        attemptsUsed: mine.filter((a) => a.status !== AttemptStatus.VOIDED).length,
        maxAttempts: exam.maxAttempts,
        inProgress: mine.some((a) => a.status === AttemptStatus.IN_PROGRESS),
        nextSitting: sitting ? { startsAt: sitting.startsAt.toISOString(), endsAt: sitting.endsAt.toISOString(), open: sitting.startsAt <= now } : null,
      };
    });

  const history = attempts
    .filter((a) => a.status !== AttemptStatus.IN_PROGRESS)
    .map((a) => ({
      id: a.id,
      examTitle: a.exam.title,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      status: a.status,
      percent: a.releasedAt ? a.percent : null,
      passed: a.releasedAt ? a.passed : null,
    }));

  return { available, history };
}
