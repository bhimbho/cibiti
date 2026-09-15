import { AttemptStatus, EventSeverity, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ResultRow } from "@/lib/results-table";
import type { TableParams } from "@/lib/table-params";
import type { Actor } from "../authz";

const statuses = Object.values(AttemptStatus);

const orderBy: Record<string, (dir: Prisma.SortOrder) => Prisma.AttemptOrderByWithRelationInput[]> = {
  submittedAt: (dir) => [{ submittedAt: { sort: dir, nulls: "last" } }],
  startedAt: (dir) => [{ startedAt: dir }],
  percent: (dir) => [{ percent: { sort: dir, nulls: "last" } }],
  candidate: (dir) => [{ user: { name: dir } }],
};

export async function listResults(actor: Actor, params: TableParams) {
  const { filters } = params;
  const where: Prisma.AttemptWhereInput = {
    exam: { orgId: actor.orgId, deletedAt: null },
    ...(filters.exam ? { examId: { in: filters.exam } } : {}),
    ...(filters.status ? { status: { in: filters.status.filter((s): s is AttemptStatus => statuses.includes(s as AttemptStatus)) } } : {}),
    ...(params.q
      ? { user: { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { regNumber: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }] } }
      : {}),
  };
  const outcome = filters.outcome ?? [];
  if (outcome.length === 1) where.passed = outcome[0] === "passed";
  const released = filters.released ?? [];
  if (released.length === 1) where.releasedAt = released[0] === "yes" ? { not: null } : null;

  const sort = params.sort ?? { id: "submittedAt", desc: true };
  const [total, attempts, exams] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      orderBy: [...(orderBy[sort.id] ?? orderBy.submittedAt)(sort.desc ? "desc" : "asc"), { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        user: { select: { name: true, regNumber: true } },
        exam: { select: { title: true } },
        _count: { select: { events: { where: { severity: { in: [EventSeverity.MEDIUM, EventSeverity.HIGH] } } } } },
      },
    }),
    prisma.exam.findMany({ where: { orgId: actor.orgId, deletedAt: null, attempts: { some: {} } }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  const rows: ResultRow[] = attempts.map((a) => ({
    id: a.id,
    candidate: a.user.name,
    regNumber: a.user.regNumber,
    exam: a.exam.title,
    examId: a.examId,
    status: a.status,
    submissionType: a.submissionType,
    score: a.score,
    maxScore: a.maxScore,
    percent: a.percent,
    passed: a.passed,
    released: Boolean(a.releasedAt),
    flags: a._count.events,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    durationMin: a.submittedAt ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 60_000) : null,
  }));

  return {
    rows,
    total,
    facets: {
      exam: exams.map((e) => ({ value: e.id, label: e.title })),
      status: [
        { value: "IN_PROGRESS", label: "In progress" },
        { value: "SUBMITTED", label: "Needs marking" },
        { value: "GRADED", label: "Graded" },
        { value: "VOIDED", label: "Voided" },
      ],
      outcome: [
        { value: "passed", label: "Passed" },
        { value: "failed", label: "Failed" },
      ],
      released: [
        { value: "yes", label: "Released" },
        { value: "no", label: "Not released" },
      ],
    },
  };
}
