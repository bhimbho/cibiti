import { AttemptStatus, ExamStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExamRow } from "@/lib/exam-table";
import type { TableParams } from "@/lib/table-params";
import type { Actor } from "../authz";

const statuses = Object.values(ExamStatus);

const orderBy: Record<string, (dir: Prisma.SortOrder) => Prisma.ExamOrderByWithRelationInput> = {
  updatedAt: (dir) => ({ updatedAt: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  title: (dir) => ({ title: dir }),
  status: (dir) => ({ status: dir }),
};

export async function listExams(actor: Actor, params: TableParams) {
  const where: Prisma.ExamWhereInput = {
    orgId: actor.orgId,
    deletedAt: null,
    ...(params.filters.status ? { status: { in: params.filters.status.filter((s): s is ExamStatus => statuses.includes(s as ExamStatus)) } } : {}),
    ...(params.filters.course ? { courseId: { in: params.filters.course } } : {}),
    ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}),
  };
  const sort = params.sort ?? { id: "updatedAt", desc: true };

  const [total, exams, courses] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      orderBy: [(orderBy[sort.id] ?? orderBy.updatedAt)(sort.desc ? "desc" : "asc"), { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        course: { select: { code: true } },
        author: { select: { name: true } },
        sections: { select: { _count: { select: { items: true } }, rules: { select: { count: true } } } },
        _count: { select: { attempts: true, sessions: true } },
      },
    }),
    prisma.course.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true } }),
  ]);

  const inProgress = await prisma.attempt.groupBy({
    by: ["examId"],
    where: { examId: { in: exams.map((e) => e.id) }, status: AttemptStatus.IN_PROGRESS },
    _count: { _all: true },
  });
  const liveByExam = new Map(inProgress.map((g) => [g.examId, g._count._all]));

  const rows: ExamRow[] = exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    status: exam.status,
    course: exam.course?.code ?? null,
    questionCount: exam.sections.reduce((sum, s) => sum + s._count.items + s.rules.reduce((r, rule) => r + rule.count, 0), 0),
    timeLimitMin: exam.timeLimitMin,
    attempts: exam._count.attempts,
    inProgress: liveByExam.get(exam.id) ?? 0,
    sittings: exam._count.sessions,
    author: exam.author.name,
    updatedAt: exam.updatedAt.toISOString(),
  }));

  return {
    rows,
    total,
    facets: {
      status: statuses.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })),
      course: courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
    },
  };
}
