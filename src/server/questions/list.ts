import { Difficulty, Prisma, QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { itemTypes } from "@/items/registry";
import type { QuestionFacets, QuestionRow } from "@/lib/question-table";
import type { TableParams } from "@/lib/table-params";
import type { Actor } from "../authz";

const statuses = Object.values(QuestionStatus);
const difficulties = Object.values(Difficulty);

const orderBy: Record<string, (dir: Prisma.SortOrder) => Prisma.QuestionOrderByWithRelationInput> = {
  updatedAt: (dir) => ({ updatedAt: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  status: (dir) => ({ status: dir }),
  difficulty: (dir) => ({ currentVersion: { difficulty: dir } }),
  type: (dir) => ({ currentVersion: { type: dir } }),
  points: (dir) => ({ currentVersion: { points: dir } }),
};

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

async function searchIds(orgId: string, q: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id FROM question q
    JOIN question_version v ON v.id = q."currentVersionId"
    WHERE q."orgId" = ${orgId} AND q."deletedAt" IS NULL
      AND (v.content->>'text') ILIKE ${`%${escapeLike(q)}%`}
    LIMIT 5000`;
  return rows.map((r) => r.id);
}

export async function listQuestions(actor: Actor, params: TableParams) {
  const { filters } = params;
  const version: Prisma.QuestionVersionWhereInput = {};
  if (filters.type) version.type = { in: filters.type };
  if (filters.difficulty) version.difficulty = { in: filters.difficulty.filter((d): d is Difficulty => difficulties.includes(d as Difficulty)) };
  if (filters.subject) version.subjectId = { in: filters.subject };

  const where: Prisma.QuestionWhereInput = {
    orgId: actor.orgId,
    deletedAt: null,
    currentVersion: { is: version },
    ...(filters.status ? { status: { in: filters.status.filter((s): s is QuestionStatus => statuses.includes(s as QuestionStatus)) } } : {}),
    ...(params.q ? { id: { in: await searchIds(actor.orgId, params.q) } } : {}),
  };

  const sort = params.sort ?? { id: "updatedAt", desc: true };
  const [total, questions, subjects] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [(orderBy[sort.id] ?? orderBy.updatedAt)(sort.desc ? "desc" : "asc"), { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
        _count: { select: { sectionItems: true } },
        currentVersion: { select: { type: true, content: true, difficulty: true, points: true, subject: { select: { name: true } }, topic: { select: { name: true } } } },
      },
    }),
    prisma.subject.findMany({ where: { orgId: actor.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: QuestionRow[] = questions.flatMap((q) => {
    const v = q.currentVersion;
    if (!v) return [];
    const text = String((v.content as { text?: string }).text ?? "");
    return [{
      id: q.id,
      text: text.length > 220 ? `${text.slice(0, 217)}…` : text,
      type: v.type,
      typeLabel: itemTypes.get(v.type)?.label ?? v.type,
      status: q.status,
      difficulty: v.difficulty,
      points: v.points,
      subject: v.subject?.name ?? null,
      topic: v.topic?.name ?? null,
      author: q.createdBy.name,
      usedInExams: q._count.sectionItems,
      updatedAt: q.updatedAt.toISOString(),
    }];
  });

  const facets: QuestionFacets = {
    status: [
      { value: "DRAFT", label: "Draft" },
      { value: "IN_REVIEW", label: "In review" },
      { value: "APPROVED", label: "Approved" },
      { value: "RETIRED", label: "Retired" },
    ],
    type: [...itemTypes.values()].map((t) => ({ value: t.key, label: t.label })),
    difficulty: [
      { value: "EASY", label: "Easy" },
      { value: "MEDIUM", label: "Medium" },
      { value: "HARD", label: "Hard" },
    ],
    subject: subjects.map((s) => ({ value: s.id, label: s.name })),
  };

  return { rows, total, facets };
}
