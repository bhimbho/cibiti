import { QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { itemTypes } from "@/items/registry";
import type { Actor } from "../authz";
import { FLAGS, isFlagEnabled } from "../flags";
import { poolWhere } from "./pool";

export type Preflight = { errors: string[]; warnings: string[]; questionCount: number; maxScore: number };

/** Checks that must pass before candidates can see an exam, plus advice that should not block. */
export async function preflight(orgId: string, examId: string): Promise<Preflight> {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          items: { include: { question: { select: { status: true, deletedAt: true, currentVersionId: true } }, version: { select: { timeEstimateSec: true } } } },
          rules: true,
        },
      },
      _count: { select: { assignments: true, sessions: true } },
    },
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const fixedIds = exam.sections.flatMap((s) => s.items.map((i) => i.questionId));
  const items = exam.sections.flatMap((s) => s.items);

  let questionCount = items.length;
  let maxScore = items.reduce((sum, i) => sum + i.points, 0);

  const unapproved = items.filter((i) => i.question.status !== QuestionStatus.APPROVED || i.question.deletedAt).length;
  if (unapproved) errors.push(`${unapproved} question${unapproved === 1 ? " is" : "s are"} not approved (or were deleted). Approve or remove ${unapproved === 1 ? "it" : "them"}.`);

  const stale = items.filter((i) => i.question.currentVersionId && i.question.currentVersionId !== i.versionId).length;
  if (stale) warnings.push(`${stale} question${stale === 1 ? " has" : "s have"} a newer version. Candidates will get the version pinned in this exam.`);

  for (const section of exam.sections) {
    for (const rule of section.rules) {
      const available = await prisma.question.count({ where: poolWhere(orgId, rule, fixedIds) });
      questionCount += Math.min(rule.count, available);
      maxScore += rule.count * rule.points;
      if (available < rule.count) {
        errors.push(`"${section.title}" draws ${rule.count} random questions but only ${available} approved question${available === 1 ? "" : "s"} match.`);
      } else if (available < rule.count * 2) {
        warnings.push(`"${section.title}" draws ${rule.count} from a pool of ${available}. Candidates will see mostly the same questions; add more to the pool.`);
      }
    }
  }

  if (questionCount === 0) errors.push("Add at least one question.");
  if (!exam.courseId && exam._count.assignments === 0) warnings.push("No course is linked, so every candidate in the organisation can take this exam.");
  if (!exam.timeLimitMin && exam._count.sessions === 0) warnings.push("There is no time limit and no sitting window.");
  if (exam.integrityLevel > 0 && !(await isFlagEnabled(orgId, FLAGS.proctoring, examId))) {
    warnings.push(`Integrity level L${exam.integrityLevel} is set, but proctoring is turned off for your organisation, so the exam runs with passive logging only.`);
  }

  const estimateSec = items.reduce((sum, i) => sum + (i.version.timeEstimateSec ?? 0), 0);
  if (exam.timeLimitMin && estimateSec > exam.timeLimitMin * 60) {
    warnings.push(`Question time estimates add up to ${Math.ceil(estimateSec / 60)} minutes, more than the ${exam.timeLimitMin}-minute limit.`);
  }

  return { errors, warnings, questionCount, maxScore };
}

export async function getExamBuilder(actor: Actor, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, orgId: actor.orgId, deletedAt: null },
    include: {
      course: { select: { id: true, code: true, title: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: {
              version: { select: { version: true, type: true, content: true, difficulty: true } },
              question: { select: { status: true, currentVersion: { select: { id: true, version: true } } } },
            },
          },
          rules: { include: { subject: { select: { name: true } }, topic: { select: { name: true } }, tag: { select: { name: true } } } },
        },
      },
      sessions: { orderBy: { startsAt: "asc" }, include: { lab: { select: { name: true } }, _count: { select: { attempts: true } } } },
      _count: { select: { attempts: true } },
    },
  });
  if (!exam) return null;

  const [check, courses, subjects, labs] = await Promise.all([
    preflight(actor.orgId, examId),
    prisma.course.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true } }),
    prisma.subject.findMany({ where: { orgId: actor.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true, topics: { orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
    prisma.lab.findMany({ where: { venue: { orgId: actor.orgId } }, orderBy: { name: "asc" }, select: { id: true, name: true, venue: { select: { name: true } } } }),
  ]);

  const fixedIds = exam.sections.flatMap((s) => s.items.map((i) => i.questionId));

  return {
    settings: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      status: exam.status,
      courseId: exam.courseId,
      timeLimitMin: exam.timeLimitMin,
      passMarkPct: exam.passMarkPct,
      maxAttempts: exam.maxAttempts,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      navigation: exam.navigation,
      negativeMarking: exam.negativeMarking,
      releasePolicy: exam.releasePolicy,
      reviewDetail: exam.reviewDetail,
      integrityLevel: exam.integrityLevel,
    },
    attemptCount: exam._count.attempts,
    sections: await Promise.all(
      exam.sections.map(async (section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        items: section.items.map((item) => ({
          id: item.id,
          questionId: item.questionId,
          points: item.points,
          version: item.version.version,
          latestVersion: item.question.currentVersion?.version ?? item.version.version,
          text: String((item.version.content as { text?: string }).text ?? ""),
          typeLabel: itemTypes.get(item.version.type)?.label ?? item.version.type,
          difficulty: item.version.difficulty,
          questionStatus: item.question.status,
        })),
        rules: await Promise.all(
          section.rules.map(async (rule) => ({
            id: rule.id,
            count: rule.count,
            points: rule.points,
            subject: rule.subject?.name ?? null,
            topic: rule.topic?.name ?? null,
            tag: rule.tag?.name ?? null,
            difficulty: rule.difficulty,
            available: await prisma.question.count({ where: poolWhere(actor.orgId, rule, fixedIds) }),
          })),
        ),
      })),
    ),
    sessions: exam.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      accessCode: s.accessCode,
      lab: s.lab?.name ?? null,
      lateJoinMin: s.lateJoinMin,
      ipAllowlist: s.ipAllowlist,
      attempts: s._count.attempts,
    })),
    preflight: check,
    options: {
      courses: courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
      subjects,
      labs: labs.map((l) => ({ value: l.id, label: `${l.venue.name} · ${l.name}` })),
    },
  };
}

export type ExamBuilderData = NonNullable<Awaited<ReturnType<typeof getExamBuilder>>>;
