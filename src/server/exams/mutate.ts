import { Difficulty, ExamStatus, NavigationMode, QuestionStatus, ReleasePolicy, ReviewDetail, type Exam } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { can, type Actor, type Permission } from "../authz";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { preflight } from "./builder";

// ─────────────── Schemas ───────────────

export const examSettingsSchema = z.object({
  title: z.string().trim().min(3, "Give the exam a title of at least 3 characters.").max(160),
  description: z.string().trim().max(2000).nullish(),
  instructions: z.string().trim().max(5000).nullish(),
  courseId: z.string().min(1).nullish(),
  timeLimitMin: z.number().int().min(1).max(600).nullable(),
  passMarkPct: z.number().int().min(0).max(100),
  maxAttempts: z.number().int().min(1).max(50),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  navigation: z.enum(NavigationMode),
  negativeMarking: z.boolean(),
  releasePolicy: z.enum(ReleasePolicy),
  reviewDetail: z.enum(ReviewDetail),
  integrityLevel: z.number().int().min(0).max(4),
});
export type ExamSettings = z.infer<typeof examSettingsSchema>;

export const sectionSchema = z.object({ title: z.string().trim().min(1).max(160), instructions: z.string().trim().max(3000).nullish() });

export const addItemsSchema = z.object({ questionIds: z.array(z.string().min(1)).min(1).max(200) });

export const updateItemSchema = z.object({
  points: z.number().min(0.25).max(100).optional(),
  move: z.enum(["up", "down"]).optional(),
  useLatestVersion: z.boolean().optional(),
});

export const ruleSchema = z.object({
  count: z.number().int().min(1).max(500),
  points: z.number().min(0.25).max(100),
  subjectId: z.string().min(1).nullish(),
  topicId: z.string().min(1).nullish(),
  difficulty: z.enum(Difficulty).nullish(),
});

export const sittingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    accessCode: z.string().trim().max(40).nullish(),
    labId: z.string().min(1).nullish(),
    lateJoinMin: z.number().int().min(0).max(600).nullish(),
    ipAllowlist: z.array(z.string().trim().min(3).max(64)).max(200).default([]),
  })
  .refine((s) => Date.parse(s.endsAt) > Date.parse(s.startsAt), { message: "The sitting must end after it starts.", path: ["endsAt"] });

// ─────────────── Guards ───────────────

type LoadedExam = Exam & { _count: { attempts: number } };

async function loadExam(actor: Actor, examId: string, permission: Permission = "exam:write"): Promise<LoadedExam> {
  const exam = await prisma.exam.findFirst({ where: { id: examId, orgId: actor.orgId, deletedAt: null }, include: { _count: { select: { attempts: true } } } });
  if (!exam) throw notFound("Exam");
  if (!can(actor, permission, { courseId: exam.courseId, departmentId: exam.departmentId })) throw forbidden();
  return exam;
}

function assertQuestionsEditable(exam: LoadedExam) {
  if (exam._count.attempts > 0) {
    throw conflict("Candidates have already started this exam, so its questions are locked. Duplicate the exam to make a changed version.");
  }
}

async function loadSection(actor: Actor, sectionId: string) {
  const section = await prisma.section.findFirst({ where: { id: sectionId, exam: { orgId: actor.orgId, deletedAt: null } }, select: { id: true, examId: true, title: true } });
  if (!section) throw notFound("Section");
  const exam = await loadExam(actor, section.examId);
  return { section, exam };
}

async function resolveCourse(actor: Actor, courseId: string | null | undefined) {
  if (!courseId) return { courseId: null, departmentId: null };
  const course = await prisma.course.findFirst({ where: { id: courseId, orgId: actor.orgId }, select: { id: true, departmentId: true } });
  if (!course) throw badRequest("Unknown course.");
  return { courseId: course.id, departmentId: course.departmentId };
}

const touch = (examId: string) => prisma.exam.update({ where: { id: examId }, data: { updatedAt: new Date() } });

// ─────────────── Exam ───────────────

export async function createExam(actor: Actor, input: ExamSettings) {
  const scope = await resolveCourse(actor, input.courseId);
  if (!can(actor, "exam:write", scope)) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: { ...input, ...scope, orgId: actor.orgId, authorId: actor.userId, sections: { create: [{ title: "Section A", order: 0 }] } },
      select: { id: true, title: true },
    });
    await audit({ actor, action: "exam.create", entityType: "exam", entityId: exam.id, after: { title: exam.title } }, tx);
    return exam;
  });
}

export async function updateExamSettings(actor: Actor, examId: string, input: ExamSettings) {
  const exam = await loadExam(actor, examId);
  const scope = await resolveCourse(actor, input.courseId);
  if (!can(actor, "exam:write", scope)) throw forbidden();

  const before = Object.fromEntries(Object.keys(input).map((key) => [key, exam[key as keyof Exam]]));
  const changed = Object.keys(input).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(input[key as keyof ExamSettings] ?? null));
  if (changed.length === 0) return { changed: [] };

  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: examId }, data: { ...input, ...scope } });
    await audit(
      {
        actor,
        action: "exam.settings",
        entityType: "exam",
        entityId: examId,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, input[k as keyof ExamSettings]])),
      },
      tx,
    );
  });
  return { changed };
}

export async function deleteExam(actor: Actor, examId: string) {
  const exam = await loadExam(actor, examId);
  if (exam._count.attempts > 0) throw conflict("This exam has attempts. Close it instead so results are kept.");
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: examId }, data: { deletedAt: new Date() } });
    await audit({ actor, action: "exam.delete", entityType: "exam", entityId: examId, before: { title: exam.title, status: exam.status } }, tx);
  });
}

export async function duplicateExam(actor: Actor, examId: string) {
  await loadExam(actor, examId);
  const source = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { sections: { include: { items: true, rules: true } } } });

  return prisma.$transaction(async (tx) => {
    const copy = await tx.exam.create({
      data: {
        orgId: source.orgId,
        title: `Copy of ${source.title}`.slice(0, 160),
        description: source.description,
        instructions: source.instructions,
        courseId: source.courseId,
        departmentId: source.departmentId,
        termId: source.termId,
        authorId: actor.userId,
        timeLimitMin: source.timeLimitMin,
        passMarkPct: source.passMarkPct,
        maxAttempts: source.maxAttempts,
        shuffleQuestions: source.shuffleQuestions,
        shuffleOptions: source.shuffleOptions,
        navigation: source.navigation,
        negativeMarking: source.negativeMarking,
        releasePolicy: source.releasePolicy,
        reviewDetail: source.reviewDetail,
        integrityLevel: source.integrityLevel,
        sections: {
          create: source.sections.map((section) => ({
            title: section.title,
            instructions: section.instructions,
            order: section.order,
            items: { create: section.items.map(({ questionId, versionId, order, points }) => ({ questionId, versionId, order, points })) },
            rules: { create: section.rules.map(({ count, points, subjectId, topicId, tagId, difficulty }) => ({ count, points, subjectId, topicId, tagId, difficulty })) },
          })),
        },
      },
      select: { id: true },
    });
    await audit({ actor, action: "exam.duplicate", entityType: "exam", entityId: copy.id, after: { from: examId } }, tx);
    return copy;
  });
}

export async function publishExam(actor: Actor, examId: string) {
  const exam = await loadExam(actor, examId, "exam:publish");
  if (exam.status === ExamStatus.PUBLISHED) return { status: exam.status };
  const check = await preflight(actor.orgId, examId);
  if (check.errors.length) throw conflict("Fix these problems before publishing.", { errors: check.errors });

  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: examId }, data: { status: ExamStatus.PUBLISHED, publishedAt: exam.publishedAt ?? new Date() } });
    await audit({ actor, action: "exam.publish", entityType: "exam", entityId: examId, before: { status: exam.status }, after: { status: ExamStatus.PUBLISHED } }, tx);
  });
  return { status: ExamStatus.PUBLISHED };
}

/** Closed exams accept no new attempts; attempts already in progress continue to their deadline. */
export async function closeExam(actor: Actor, examId: string) {
  const exam = await loadExam(actor, examId, "exam:publish");
  if (exam.status !== ExamStatus.PUBLISHED) throw conflict("Only a published exam can be closed.");
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: examId }, data: { status: ExamStatus.CLOSED } });
    await audit({ actor, action: "exam.close", entityType: "exam", entityId: examId, before: { status: exam.status }, after: { status: ExamStatus.CLOSED } }, tx);
  });
  return { status: ExamStatus.CLOSED };
}

export async function unpublishExam(actor: Actor, examId: string) {
  const exam = await loadExam(actor, examId, "exam:publish");
  if (exam._count.attempts > 0) throw conflict("Candidates have started this exam. Close it instead.");
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: examId }, data: { status: ExamStatus.DRAFT } });
    await audit({ actor, action: "exam.unpublish", entityType: "exam", entityId: examId, before: { status: exam.status }, after: { status: ExamStatus.DRAFT } }, tx);
  });
  return { status: ExamStatus.DRAFT };
}

// ─────────────── Sections ───────────────

export async function addSection(actor: Actor, examId: string, input: z.infer<typeof sectionSchema>) {
  const exam = await loadExam(actor, examId);
  assertQuestionsEditable(exam);
  const last = await prisma.section.aggregate({ where: { examId }, _max: { order: true } });
  const section = await prisma.section.create({ data: { examId, title: input.title, instructions: input.instructions || null, order: (last._max.order ?? -1) + 1 }, select: { id: true } });
  await touch(examId);
  return section;
}

export async function updateSection(actor: Actor, sectionId: string, input: z.infer<typeof sectionSchema>) {
  const { section } = await loadSection(actor, sectionId);
  await prisma.section.update({ where: { id: section.id }, data: { title: input.title, instructions: input.instructions || null } });
  await touch(section.examId);
}

export async function deleteSection(actor: Actor, sectionId: string) {
  const { section, exam } = await loadSection(actor, sectionId);
  assertQuestionsEditable(exam);
  if ((await prisma.section.count({ where: { examId: section.examId } })) <= 1) throw conflict("An exam needs at least one section.");
  await prisma.section.delete({ where: { id: section.id } });
  await touch(section.examId);
}

// ─────────────── Fixed questions ───────────────

export async function addQuestionsToSection(actor: Actor, sectionId: string, questionIds: string[]) {
  const { section, exam } = await loadSection(actor, sectionId);
  assertQuestionsEditable(exam);

  const [questions, existing] = await Promise.all([
    prisma.question.findMany({
      where: { id: { in: questionIds }, orgId: actor.orgId, deletedAt: null, status: { not: QuestionStatus.RETIRED } },
      select: { id: true, currentVersion: { select: { id: true, points: true } } },
    }),
    prisma.sectionItem.findMany({ where: { section: { examId: section.examId } }, select: { questionId: true } }),
  ]);
  const inExam = new Set(existing.map((e) => e.questionId));
  const last = await prisma.sectionItem.aggregate({ where: { sectionId }, _max: { order: true } });
  let order = (last._max.order ?? -1) + 1;

  // Keep the order the author picked them in.
  const byId = new Map(questions.map((q) => [q.id, q]));
  const toAdd = questionIds.flatMap((id) => {
    const q = byId.get(id);
    if (!q?.currentVersion || inExam.has(id)) return [];
    inExam.add(id);
    return [{ sectionId, questionId: id, versionId: q.currentVersion.id, points: q.currentVersion.points, order: order++ }];
  });

  if (toAdd.length) await prisma.sectionItem.createMany({ data: toAdd });
  await touch(section.examId);
  return { added: toAdd.length, skipped: questionIds.length - toAdd.length };
}

export async function updateSectionItem(actor: Actor, itemId: string, input: z.infer<typeof updateItemSchema>) {
  const item = await prisma.sectionItem.findFirst({
    where: { id: itemId, section: { exam: { orgId: actor.orgId, deletedAt: null } } },
    include: { section: { select: { examId: true } }, question: { select: { currentVersionId: true } } },
  });
  if (!item) throw notFound("Question");
  const exam = await loadExam(actor, item.section.examId);
  assertQuestionsEditable(exam);

  await prisma.$transaction(async (tx) => {
    if (input.points !== undefined || input.useLatestVersion) {
      await tx.sectionItem.update({
        where: { id: itemId },
        data: {
          ...(input.points !== undefined ? { points: input.points } : {}),
          ...(input.useLatestVersion && item.question.currentVersionId ? { versionId: item.question.currentVersionId } : {}),
        },
      });
    }
    if (input.move) {
      const neighbour = await tx.sectionItem.findFirst({
        where: { sectionId: item.sectionId, order: input.move === "up" ? { lt: item.order } : { gt: item.order } },
        orderBy: { order: input.move === "up" ? "desc" : "asc" },
      });
      if (neighbour) {
        // Two-step swap avoids clashing orders if a unique index is added later.
        await tx.sectionItem.update({ where: { id: item.id }, data: { order: -1 } });
        await tx.sectionItem.update({ where: { id: neighbour.id }, data: { order: item.order } });
        await tx.sectionItem.update({ where: { id: item.id }, data: { order: neighbour.order } });
      }
    }
    await tx.exam.update({ where: { id: exam.id }, data: { updatedAt: new Date() } });
  });
}

export async function removeSectionItem(actor: Actor, itemId: string) {
  const item = await prisma.sectionItem.findFirst({ where: { id: itemId, section: { exam: { orgId: actor.orgId, deletedAt: null } } }, include: { section: { select: { examId: true } } } });
  if (!item) throw notFound("Question");
  const exam = await loadExam(actor, item.section.examId);
  assertQuestionsEditable(exam);
  await prisma.sectionItem.delete({ where: { id: itemId } });
  await touch(exam.id);
}

// ─────────────── Random draw rules ───────────────

export async function addRule(actor: Actor, sectionId: string, input: z.infer<typeof ruleSchema>) {
  const { section, exam } = await loadSection(actor, sectionId);
  assertQuestionsEditable(exam);
  if (input.subjectId && !(await prisma.subject.count({ where: { id: input.subjectId, orgId: actor.orgId } }))) throw badRequest("Unknown subject.");
  if (input.topicId && !(await prisma.topic.count({ where: { id: input.topicId, subject: { orgId: actor.orgId }, ...(input.subjectId ? { subjectId: input.subjectId } : {}) } }))) {
    throw badRequest("Unknown topic.");
  }
  const rule = await prisma.selectionRule.create({
    data: { sectionId, count: input.count, points: input.points, subjectId: input.subjectId ?? null, topicId: input.topicId ?? null, difficulty: input.difficulty ?? null },
    select: { id: true },
  });
  await touch(section.examId);
  return rule;
}

export async function removeRule(actor: Actor, ruleId: string) {
  const rule = await prisma.selectionRule.findFirst({ where: { id: ruleId, section: { exam: { orgId: actor.orgId, deletedAt: null } } }, include: { section: { select: { examId: true } } } });
  if (!rule) throw notFound("Rule");
  const exam = await loadExam(actor, rule.section.examId);
  assertQuestionsEditable(exam);
  await prisma.selectionRule.delete({ where: { id: ruleId } });
  await touch(exam.id);
}

// ─────────────── Sittings ───────────────

export async function addSitting(actor: Actor, examId: string, input: z.infer<typeof sittingSchema>) {
  await loadExam(actor, examId);
  if (input.labId && !(await prisma.lab.count({ where: { id: input.labId, venue: { orgId: actor.orgId } } }))) throw badRequest("Unknown lab.");
  return prisma.$transaction(async (tx) => {
    const sitting = await tx.examSession.create({
      data: {
        examId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        accessCode: input.accessCode || null,
        labId: input.labId ?? null,
        lateJoinMin: input.lateJoinMin ?? null,
        ipAllowlist: input.ipAllowlist,
      },
      select: { id: true },
    });
    await audit({ actor, action: "exam.sitting.create", entityType: "exam", entityId: examId, after: { sittingId: sitting.id, name: input.name, startsAt: input.startsAt, endsAt: input.endsAt } }, tx);
    return sitting;
  });
}

export async function removeSitting(actor: Actor, sittingId: string) {
  const sitting = await prisma.examSession.findFirst({ where: { id: sittingId, exam: { orgId: actor.orgId } }, include: { _count: { select: { attempts: true } } } });
  if (!sitting) throw notFound("Sitting");
  await loadExam(actor, sitting.examId);
  if (sitting._count.attempts > 0) throw conflict("Candidates have written in this sitting, so it cannot be deleted.");
  await prisma.$transaction(async (tx) => {
    await tx.examSession.delete({ where: { id: sittingId } });
    await audit({ actor, action: "exam.sitting.delete", entityType: "exam", entityId: sitting.examId, before: { sittingId, name: sitting.name } }, tx);
  });
}
