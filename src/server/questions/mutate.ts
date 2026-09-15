import { Difficulty, Prisma, QuestionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseAuthoredItem } from "@/items/registry";
import { audit } from "../audit";
import { can, type Actor } from "../authz";
import { badRequest, conflict, notFound, toJson } from "../http";

export const questionInputSchema = z.object({
  type: z.string().min(1),
  content: z.object({
    text: z.string().trim().min(1, "Write the question.").max(10_000),
    assetIds: z.array(z.string().min(1)).max(10).default([]),
  }),
  interaction: z.unknown(),
  scoring: z.unknown(),
  explanation: z.string().trim().max(5000).nullish(),
  difficulty: z.enum(Difficulty),
  points: z.number().min(0.25).max(100),
  timeEstimateSec: z.number().int().min(5).max(3600).nullish(),
  subjectId: z.string().min(1).nullish(),
  topicId: z.string().min(1).nullish(),
  status: z.enum(QuestionStatus).optional(),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

async function validateReferences(actor: Actor, input: QuestionInput) {
  if (input.content.assetIds.length) {
    const found = await prisma.asset.count({ where: { id: { in: input.content.assetIds }, orgId: actor.orgId } });
    if (found !== new Set(input.content.assetIds).size) throw badRequest("One of the images could not be found.");
  }
  if (input.subjectId && !(await prisma.subject.count({ where: { id: input.subjectId, orgId: actor.orgId } }))) throw badRequest("Unknown subject.");
  if (input.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: input.topicId, subject: { orgId: actor.orgId } }, select: { subjectId: true } });
    if (!topic) throw badRequest("Unknown topic.");
    if (input.subjectId && topic.subjectId !== input.subjectId) throw badRequest("The topic does not belong to the chosen subject.");
  }

  const parsed = parseAuthoredItem(input.type, input.interaction, input.scoring);
  if (!parsed.ok) throw badRequest(parsed.errors[0] ?? "The question is not valid.", parsed.errors.map((message) => ({ path: "item", message })));
  return parsed.value;
}

/** Authors can only save drafts or submit for review; reviewers may also approve directly. */
function allowedStatus(actor: Actor, requested: QuestionStatus | undefined, fallback: QuestionStatus): QuestionStatus {
  if (!requested) return fallback;
  if ((requested === QuestionStatus.APPROVED || requested === QuestionStatus.RETIRED) && !can(actor, "question:review")) return QuestionStatus.IN_REVIEW;
  return requested;
}

function versionData(input: QuestionInput, item: { interaction: unknown; scoring: unknown }) {
  return {
    type: input.type,
    content: toJson(input.content) as Prisma.InputJsonValue,
    interaction: toJson(item.interaction) as Prisma.InputJsonValue,
    scoring: toJson(item.scoring) as Prisma.InputJsonValue,
    explanation: input.explanation || null,
    difficulty: input.difficulty,
    points: input.points,
    timeEstimateSec: input.timeEstimateSec ?? null,
    subjectId: input.subjectId ?? null,
    topicId: input.topicId ?? null,
  };
}

export async function createQuestion(actor: Actor, input: QuestionInput) {
  const item = await validateReferences(actor, input);
  const status = allowedStatus(actor, input.status, QuestionStatus.DRAFT);

  return prisma.$transaction(async (tx) => {
    const question = await tx.question.create({ data: { orgId: actor.orgId, status, createdById: actor.userId } });
    const version = await tx.questionVersion.create({ data: { questionId: question.id, version: 1, createdById: actor.userId, ...versionData(input, item) } });
    await tx.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
    await audit({ actor, action: "question.create", entityType: "question", entityId: question.id, after: { version: 1, status, type: input.type } }, tx);
    return { id: question.id, version: 1, status };
  });
}

const comparable = (v: ReturnType<typeof versionData>) => JSON.stringify(v);

/**
 * Saving an edit never changes history: it adds a new version. Exams keep the version they pinned.
 * Editing an approved question sends it back to review unless the editor is a reviewer.
 */
export async function updateQuestion(actor: Actor, id: string, input: QuestionInput) {
  const existing = await prisma.question.findFirst({ where: { id, orgId: actor.orgId, deletedAt: null }, include: { currentVersion: true } });
  if (!existing?.currentVersion) throw notFound("Question");
  const item = await validateReferences(actor, input);
  const next = versionData(input, item);
  const cur = existing.currentVersion;
  const current = versionData(
    { type: cur.type, content: cur.content as QuestionInput["content"], interaction: cur.interaction, scoring: cur.scoring, explanation: cur.explanation, difficulty: cur.difficulty, points: cur.points, timeEstimateSec: cur.timeEstimateSec, subjectId: cur.subjectId, topicId: cur.topicId },
    { interaction: cur.interaction, scoring: cur.scoring },
  );
  const contentChanged = comparable(next) !== comparable(current);

  const fallback = contentChanged && existing.status === QuestionStatus.APPROVED && !can(actor, "question:review") ? QuestionStatus.IN_REVIEW : existing.status;
  const status = allowedStatus(actor, input.status, fallback);
  if (!contentChanged && status === existing.status) return { id, version: cur.version, status, changed: false };

  return prisma.$transaction(async (tx) => {
    let version = cur.version;
    if (contentChanged) {
      const latest = await tx.questionVersion.aggregate({ where: { questionId: id }, _max: { version: true } });
      version = (latest._max.version ?? 0) + 1;
      const created = await tx.questionVersion.create({ data: { questionId: id, version, createdById: actor.userId, ...next } });
      await tx.question.update({ where: { id }, data: { currentVersionId: created.id, status } });
    } else {
      await tx.question.update({ where: { id }, data: { status } });
    }
    await audit({ actor, action: "question.update", entityType: "question", entityId: id, before: { version: cur.version, status: existing.status }, after: { version, status } }, tx);
    return { id, version, status, changed: true };
  });
}

export async function deleteQuestion(actor: Actor, id: string) {
  const question = await prisma.question.findFirst({
    where: { id, orgId: actor.orgId, deletedAt: null },
    select: { id: true, status: true, _count: { select: { sectionItems: true, attemptItems: true } } },
  });
  if (!question) throw notFound("Question");
  if (question._count.sectionItems || question._count.attemptItems) {
    throw conflict("This question is used in an exam or has been answered. Retire it instead so results stay intact.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.question.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actor, action: "question.delete", entityType: "question", entityId: id, before: { status: question.status } }, tx);
  });
}

export async function getQuestionForEditing(actor: Actor, id: string) {
  const question = await prisma.question.findFirst({
    where: { id, orgId: actor.orgId, deletedAt: null },
    include: {
      currentVersion: true,
      createdBy: { select: { name: true } },
      versions: { orderBy: { version: "desc" }, take: 20, select: { version: true, createdAt: true, createdBy: { select: { name: true } } } },
      _count: { select: { sectionItems: true, attemptItems: true } },
    },
  });
  if (!question?.currentVersion) return null;
  const v = question.currentVersion;
  return {
    id: question.id,
    status: question.status,
    author: question.createdBy.name,
    usedInExams: question._count.sectionItems,
    timesAnswered: question._count.attemptItems,
    versions: question.versions.map((x) => ({ version: x.version, createdAt: x.createdAt.toISOString(), author: x.createdBy.name })),
    input: {
      type: v.type,
      content: v.content as { text: string; assetIds: string[] },
      interaction: v.interaction,
      scoring: v.scoring,
      explanation: v.explanation,
      difficulty: v.difficulty,
      points: v.points,
      timeEstimateSec: v.timeEstimateSec,
      subjectId: v.subjectId,
      topicId: v.topicId,
    },
  };
}

export async function listSubjects(orgId: string) {
  return prisma.subject.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, topics: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
}
