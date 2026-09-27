/**
 * Database-backed tests for exam analytics: which attempts are counted, how a
 * question answered by only part of the cohort is treated, and that the numbers
 * reaching the page match the formulas.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import {
  AttemptStatus,
  ExamStatus,
  GradeMethod,
  OrgKind,
  PrismaClient,
  QuestionStatus,
  Role,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";
import { examAnalytics } from "./exam";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `statspec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let staff: Actor;
let candidateIds: string[] = [];

function actorFor(userId: string, role: Role): Actor {
  return {
    userId,
    orgId,
    name: role,
    roles: [role],
    memberships: [{ role, departmentId: null, courseId: null }],
    isStaff: role !== Role.CANDIDATE,
    isCandidate: role === Role.CANDIDATE,
  };
}

async function makeQuestion(text: string) {
  const question = await prisma.question.create({
    data: { orgId, status: QuestionStatus.APPROVED, createdById: staff.userId },
    select: { id: true },
  });
  const version = await prisma.questionVersion.create({
    data: {
      questionId: question.id,
      version: 1,
      type: "true-false",
      content: { text, assetIds: [] },
      interaction: {},
      scoring: { correct: "true" },
      points: 1,
      createdById: staff.userId,
    },
    select: { id: true },
  });
  return { questionId: question.id, versionId: version.id };
}

async function makeExam(passMarkPct = 50) {
  return prisma.exam.create({
    data: {
      orgId,
      title: `${stamp} ${Math.random().toString(36).slice(2, 6)}`,
      status: ExamStatus.PUBLISHED,
      authorId: staff.userId,
      passMarkPct,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
}

/** A graded attempt whose item marks are given directly, one per question. */
async function makeGradedAttempt(
  examId: string,
  userId: string,
  parts: { questionId: string; versionId: string; earned: number }[],
  status: AttemptStatus = AttemptStatus.GRADED,
) {
  const maxScore = parts.length;
  const score = parts.reduce((sum, p) => sum + p.earned, 0);
  const attemptNo = (await prisma.attempt.count({ where: { examId, userId } })) + 1;
  const attempt = await prisma.attempt.create({
    data: {
      examId,
      userId,
      attemptNo,
      status,
      maxScore,
      score: status === AttemptStatus.GRADED ? score : null,
      percent: status === AttemptStatus.GRADED ? (score / maxScore) * 100 : null,
      passed: status === AttemptStatus.GRADED ? score / maxScore >= 0.5 : null,
      submittedAt: new Date(),
      gradedAt: status === AttemptStatus.GRADED ? new Date() : null,
    },
    select: { id: true },
  });
  for (const [index, part] of parts.entries()) {
    await prisma.attemptItem.create({
      data: {
        attemptId: attempt.id,
        order: index,
        questionId: part.questionId,
        versionId: part.versionId,
        points: 1,
        layout: {},
        grade: {
          create: {
            points: part.earned,
            maxPoints: 1,
            isCorrect: part.earned >= 1,
            method: GradeMethod.AUTO,
          },
        },
      },
    });
  }
  return attempt.id;
}

describe.skipIf(!hasDb)("exam analytics", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: stamp, slug: stamp, kind: OrgKind.UNIVERSITY },
      select: { id: true },
    });
    orgId = org.id;
    const officer = await prisma.user.create({
      data: { orgId, name: "Officer", email: `${stamp}-officer@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    staff = actorFor(officer.id, Role.EXAM_OFFICER);
    candidateIds = [];
    for (let i = 0; i < 4; i++) {
      const user = await prisma.user.create({
        data: { orgId, name: `Candidate ${i}`, email: `${stamp}-c${i}@test.local`, passwordHash: "x" },
        select: { id: true },
      });
      candidateIds.push(user.id);
    }
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.question.updateMany({ where: { orgId }, data: { currentVersionId: null } });
    await prisma.questionVersion.deleteMany({ where: { question: { orgId } } });
    await prisma.question.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("summarises the cohort from graded attempts only", async () => {
    const exam = await makeExam();
    const q1 = await makeQuestion(`${stamp} q1`);
    const q2 = await makeQuestion(`${stamp} q2`);
    // Scores of 100%, 50%, 50% and 0%.
    await makeGradedAttempt(exam.id, candidateIds[0], [{ ...q1, earned: 1 }, { ...q2, earned: 1 }]);
    await makeGradedAttempt(exam.id, candidateIds[1], [{ ...q1, earned: 1 }, { ...q2, earned: 0 }]);
    await makeGradedAttempt(exam.id, candidateIds[2], [{ ...q1, earned: 1 }, { ...q2, earned: 0 }]);
    await makeGradedAttempt(exam.id, candidateIds[3], [{ ...q1, earned: 0 }, { ...q2, earned: 0 }]);
    // Still being marked: must not be counted.
    await makeGradedAttempt(exam.id, candidateIds[0], [{ ...q1, earned: 1 }, { ...q2, earned: 1 }], AttemptStatus.SUBMITTED);

    const data = (await examAnalytics(staff, exam.id))!;

    expect(data.counted).toBe(4);
    expect(data.awaitingMarking).toBe(1);
    expect(data.summary).toMatchObject({ mean: 50, median: 50, highest: 100, lowest: 0, passRate: 75 });
  });

  it("reports difficulty and discrimination per question", async () => {
    const exam = await makeExam();
    const easy = await makeQuestion(`${stamp} easy`);
    const hard = await makeQuestion(`${stamp} hard`);
    // Everyone gets `easy`; only the strongest gets `hard`.
    await makeGradedAttempt(exam.id, candidateIds[0], [{ ...easy, earned: 1 }, { ...hard, earned: 1 }]);
    await makeGradedAttempt(exam.id, candidateIds[1], [{ ...easy, earned: 1 }, { ...hard, earned: 0 }]);
    await makeGradedAttempt(exam.id, candidateIds[2], [{ ...easy, earned: 1 }, { ...hard, earned: 0 }]);
    await makeGradedAttempt(exam.id, candidateIds[3], [{ ...easy, earned: 1 }, { ...hard, earned: 0 }]);

    const data = (await examAnalytics(staff, exam.id))!;
    const easyRow = data.items.find((i) => i.questionId === easy.questionId)!;
    const hardRow = data.items.find((i) => i.questionId === hard.questionId)!;

    expect(easyRow).toMatchObject({ difficulty: 1, responses: 4, fullMarks: 100 });
    expect(easyRow.verdict).toMatch(/separates nobody/i);
    expect(hardRow).toMatchObject({ difficulty: 0.25, fullMarks: 25 });
    // Hardest first, so the questions needing attention are at the top.
    expect(data.items[0].questionId).toBe(hard.questionId);
  });

  it("marks a question only part of the cohort saw, and keeps it out of alpha", async () => {
    const exam = await makeExam();
    const common = await makeQuestion(`${stamp} common`);
    const alsoCommon = await makeQuestion(`${stamp} also common`);
    const drawn = await makeQuestion(`${stamp} drawn`);
    await makeGradedAttempt(exam.id, candidateIds[0], [
      { ...common, earned: 1 },
      { ...alsoCommon, earned: 1 },
      { ...drawn, earned: 1 },
    ]);
    await makeGradedAttempt(exam.id, candidateIds[1], [
      { ...common, earned: 1 },
      { ...alsoCommon, earned: 0 },
    ]);
    await makeGradedAttempt(exam.id, candidateIds[2], [
      { ...common, earned: 0 },
      { ...alsoCommon, earned: 0 },
    ]);

    const data = (await examAnalytics(staff, exam.id))!;
    const drawnRow = data.items.find((i) => i.questionId === drawn.questionId)!;
    const commonRow = data.items.find((i) => i.questionId === common.questionId)!;

    expect(drawnRow).toMatchObject({ partialCohort: true, responses: 1 });
    expect(commonRow.partialCohort).toBe(false);
    // Alpha is computed over the two questions everyone saw, not the drawn one.
    expect(data.summary.alpha).not.toBeUndefined();
  });

  it("reports a cut-score curve around the exam's pass mark", async () => {
    const exam = await makeExam(50);
    const q1 = await makeQuestion(`${stamp} cut q1`);
    const q2 = await makeQuestion(`${stamp} cut q2`);
    await makeGradedAttempt(exam.id, candidateIds[0], [{ ...q1, earned: 1 }, { ...q2, earned: 1 }]);
    await makeGradedAttempt(exam.id, candidateIds[1], [{ ...q1, earned: 1 }, { ...q2, earned: 0 }]);

    const data = (await examAnalytics(staff, exam.id))!;

    expect(data.cutScores.map((c) => c.cut)).toEqual([40, 45, 50, 55, 60]);
    expect(data.cutScores.find((c) => c.cut === 50)).toMatchObject({ passed: 2, rate: 100 });
    expect(data.cutScores.find((c) => c.cut === 60)).toMatchObject({ passed: 1, rate: 50 });
  });

  it("says nothing confident about an exam nobody has finished", async () => {
    const exam = await makeExam();

    const data = (await examAnalytics(staff, exam.id))!;

    expect(data.counted).toBe(0);
    expect(data.items).toEqual([]);
    expect(data.summary).toMatchObject({ mean: 0, passRate: 0, alpha: null, standardError: null });
  });

  it("does not reach another organisation's exam", async () => {
    const other = await prisma.organization.create({
      data: { name: `${stamp}-other`, slug: `${stamp}-other`, kind: OrgKind.SCHOOL },
      select: { id: true },
    });
    const exam = await makeExam();

    expect(await examAnalytics({ ...staff, orgId: other.id }, exam.id)).toBeNull();

    await prisma.organization.delete({ where: { id: other.id } });
  });

  it("refuses a candidate", async () => {
    const exam = await makeExam();
    await expect(examAnalytics(actorFor(candidateIds[0], Role.CANDIDATE), exam.id)).rejects.toThrow(/permission/i);
  });
});
