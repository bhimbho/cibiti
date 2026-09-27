/**
 * Database-backed tests for the marking queue. What matters here is which answers
 * appear in the queue, what a mark does to the attempt, and when an attempt is
 * totalled and closed — all of it in queries, none of it reachable from the pure
 * tests in score.test.ts.
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
  ReleasePolicy,
  Role,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";
import { gradeItem, gradingItems, gradingQueue } from "./queue";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `gradespec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let grader: Actor;
let candidate: Actor;
let authorId = "";

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

/** A short-answer question configured to send unmatched answers to a human. */
async function makeQuestion(text: string) {
  const question = await prisma.question.create({
    data: { orgId, status: QuestionStatus.APPROVED, createdById: authorId },
    select: { id: true },
  });
  const version = await prisma.questionVersion.create({
    data: {
      questionId: question.id,
      version: 1,
      type: "short-answer",
      content: { text, assetIds: [] },
      interaction: { maxLength: 200 },
      scoring: { acceptedAnswers: ["osmosis"], caseSensitive: false, maxTypos: 0, manualReviewUnmatched: true },
      explanation: "Water moving down its own gradient.",
      points: 4,
      createdById: authorId,
    },
    select: { id: true },
  });
  return { questionId: question.id, versionId: version.id };
}

/**
 * A submitted attempt whose items are already auto-graded and flagged for a
 * human, which is the state finalizeAttempt leaves behind for an unmatched answer.
 */
async function makeSubmittedAttempt(
  examId: string,
  parts: { questionId: string; versionId: string; answer: string; points?: number }[],
) {
  // One candidate sitting the same exam twice in a test needs distinct attempt
  // numbers; the pair is unique per exam.
  const attemptNo =
    (await prisma.attempt.count({ where: { examId, userId: candidate.userId } })) + 1;
  const attempt = await prisma.attempt.create({
    data: {
      examId,
      userId: candidate.userId,
      attemptNo,
      status: AttemptStatus.SUBMITTED,
      maxScore: parts.reduce((sum, p) => sum + (p.points ?? 4), 0),
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  const itemIds: string[] = [];
  for (const [index, part] of parts.entries()) {
    const item = await prisma.attemptItem.create({
      data: {
        attemptId: attempt.id,
        order: index,
        questionId: part.questionId,
        versionId: part.versionId,
        points: part.points ?? 4,
        layout: {},
        response: { create: { value: { text: part.answer } } },
        grade: {
          create: {
            points: 0,
            maxPoints: part.points ?? 4,
            isCorrect: null,
            method: GradeMethod.AUTO,
            needsManual: true,
          },
        },
      },
      select: { id: true },
    });
    itemIds.push(item.id);
  }
  return { attemptId: attempt.id, itemIds };
}

async function makeExam(policy: ReleasePolicy = ReleasePolicy.IMMEDIATE, passMarkPct = 50) {
  return prisma.exam.create({
    data: {
      orgId,
      title: `${stamp} exam ${Math.random().toString(36).slice(2, 6)}`,
      status: ExamStatus.PUBLISHED,
      authorId,
      releasePolicy: policy,
      passMarkPct,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
}

describe.skipIf(!hasDb)("marking queue", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: stamp, slug: stamp, kind: OrgKind.UNIVERSITY },
      select: { id: true },
    });
    orgId = org.id;
    const staffUser = await prisma.user.create({
      data: { orgId, name: "Grader", email: `${stamp}-grader@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    const candidateUser = await prisma.user.create({
      data: { orgId, name: "Ada Candidate", regNumber: "CSC/9999/001", email: `${stamp}-cand@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    authorId = staffUser.id;
    grader = actorFor(staffUser.id, Role.GRADER);
    candidate = actorFor(candidateUser.id, Role.CANDIDATE);
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

  it("lists flagged answers grouped by question, with a pending count", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} what is osmosis?`);
    await makeSubmittedAttempt(exam.id, [{ ...question, answer: "water moving" }]);
    await makeSubmittedAttempt(exam.id, [{ ...question, answer: "diffusion of water" }]);

    const queue = await gradingQueue(grader);
    const group = queue.find((g) => g.questionId === question.questionId);

    expect(group).toMatchObject({ examId: exam.id, pending: 2, maxPoints: 4 });
  });

  it("withholds candidate identity unless names are asked for", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} anonymity`);
    await makeSubmittedAttempt(exam.id, [{ ...question, answer: "an answer" }]);

    const anonymous = await gradingItems(grader, exam.id, question.questionId);
    expect(anonymous[0]).toMatchObject({ candidate: null, regNumber: null });

    const named = await gradingItems(grader, exam.id, question.questionId, { anonymous: false });
    expect(named[0]).toMatchObject({ candidate: "Ada Candidate", regNumber: "CSC/9999/001" });
  });

  it("gives the marker the answer, the key and the allocation", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} context`);
    await makeSubmittedAttempt(exam.id, [{ ...question, answer: "water goes in" }]);

    const [item] = await gradingItems(grader, exam.id, question.questionId);

    expect(item.response).toEqual({ text: "water goes in" });
    expect(item.scoring).toMatchObject({ acceptedAnswers: ["osmosis"] });
    expect(item.maxPoints).toBe(4);
    expect(item.points).toBeNull();
    expect(item.graded).toBe(false);
  });

  it("totals and closes the attempt when its last answer is marked", async () => {
    const exam = await makeExam(ReleasePolicy.MANUAL);
    const question = await makeQuestion(`${stamp} single part`);
    const { attemptId, itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "osmosis-ish" }]);

    const result = await gradeItem(grader, itemIds[0], { points: 3, comment: "Close enough" });

    expect(result.points).toBe(3);
    expect(result.attempt).toMatchObject({ status: AttemptStatus.GRADED, outstanding: 0, score: 3, percent: 75, passed: true });
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe(AttemptStatus.GRADED);
    expect(attempt.gradedAt).not.toBeNull();
    // MANUAL policy: marking does not publish the result.
    expect(attempt.releasedAt).toBeNull();
  });

  it("keeps the attempt open while another answer is still unmarked", async () => {
    const exam = await makeExam();
    const first = await makeQuestion(`${stamp} part one`);
    const second = await makeQuestion(`${stamp} part two`);
    const { attemptId, itemIds } = await makeSubmittedAttempt(exam.id, [
      { ...first, answer: "one" },
      { ...second, answer: "two" },
    ]);

    const result = await gradeItem(grader, itemIds[0], { points: 4 });

    expect(result.attempt).toMatchObject({ status: AttemptStatus.SUBMITTED, outstanding: 1 });
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe(AttemptStatus.SUBMITTED);
    expect(attempt.score).toBeNull();
  });

  it("releases the result on an IMMEDIATE exam once marking finishes", async () => {
    const exam = await makeExam(ReleasePolicy.IMMEDIATE);
    const question = await makeQuestion(`${stamp} immediate`);
    const { attemptId, itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "osmosis" }]);

    await gradeItem(grader, itemIds[0], { points: 4 });

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.releasedAt).not.toBeNull();
  });

  it("never releases a result on a NEVER exam, however it is marked", async () => {
    const exam = await makeExam(ReleasePolicy.NEVER);
    const question = await makeQuestion(`${stamp} withheld`);
    const { attemptId, itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "osmosis" }]);

    await gradeItem(grader, itemIds[0], { points: 4 });

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe(AttemptStatus.GRADED);
    expect(attempt.releasedAt).toBeNull();
  });

  it("caps a mark at the question's allocation", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} overshoot`);
    const { itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "everything" }]);

    const result = await gradeItem(grader, itemIds[0], { points: 999 });

    expect(result.points).toBe(4);
  });

  it("re-marks an answer and re-totals the attempt", async () => {
    const exam = await makeExam(ReleasePolicy.MANUAL);
    const question = await makeQuestion(`${stamp} moderation`);
    const { attemptId, itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "partly right" }]);

    await gradeItem(grader, itemIds[0], { points: 1 });
    const second = await gradeItem(grader, itemIds[0], { points: 4, comment: "Moderated up" });

    expect(second.attempt).toMatchObject({ score: 4, percent: 100 });
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.score).toBe(4);
    const grade = await prisma.itemGrade.findUniqueOrThrow({ where: { attemptItemId: itemIds[0] } });
    expect(grade).toMatchObject({ method: GradeMethod.MANUAL, comment: "Moderated up", needsManual: false });
    expect(grade.graderId).toBe(grader.userId);
  });

  it("drops a marked answer out of the queue", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} disappears`);
    const { itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "done" }]);

    await gradeItem(grader, itemIds[0], { points: 2 });

    const queue = await gradingQueue(grader);
    expect(queue.find((g) => g.questionId === question.questionId)).toBeUndefined();
    // It is still reachable for moderation when marked answers are asked for.
    const withGraded = await gradingItems(grader, exam.id, question.questionId, { includeGraded: true });
    expect(withGraded[0]).toMatchObject({ graded: true, points: 2 });
  });

  it("refuses a candidate trying to mark or read the queue", async () => {
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} permissions`);
    const { itemIds } = await makeSubmittedAttempt(exam.id, [{ ...question, answer: "mine" }]);

    await expect(gradingQueue(candidate)).rejects.toThrow(/permission|graders/i);
    await expect(gradeItem(candidate, itemIds[0], { points: 4 })).rejects.toThrow(/permission|graders/i);
  });

  it("does not leak another organisation's answers", async () => {
    const other = await prisma.organization.create({
      data: { name: `${stamp}-other`, slug: `${stamp}-other`, kind: OrgKind.SCHOOL },
      select: { id: true },
    });
    const outsider = actorFor(grader.userId, Role.GRADER);
    const exam = await makeExam();
    const question = await makeQuestion(`${stamp} tenancy`);
    await makeSubmittedAttempt(exam.id, [{ ...question, answer: "secret" }]);

    const queue = await gradingQueue({ ...outsider, orgId: other.id });
    expect(queue).toEqual([]);

    await prisma.organization.delete({ where: { id: other.id } });
  });
});
