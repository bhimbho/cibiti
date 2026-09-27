/**
 * Database-backed tests for exam-day recovery: what a restart does to the attempt,
 * that it frees the candidate to sit again, who is allowed to do it, and the cap on
 * added time.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { AttemptStatus, ExamStatus, OrgKind, PrismaClient, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";
import { extendAttempt } from "../invigilation";
import { restartAttempt } from "./restart";
import { setExamDayPolicy } from "./store";
import { DEFAULT_EXAM_DAY_POLICY, type ExamDayPolicy } from "./policy";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `restartspec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let admin: Actor;
let officer: Actor;
let invigilator: Actor;
let candidateId = "";

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

async function policy(patch: Partial<ExamDayPolicy>) {
  await setExamDayPolicy(admin, { ...DEFAULT_EXAM_DAY_POLICY, ...patch });
}

async function makeExam(options: { timeLimitMin?: number | null; maxAttempts?: number } = {}) {
  return prisma.exam.create({
    data: {
      orgId,
      title: `${stamp} ${Math.random().toString(36).slice(2, 6)}`,
      status: ExamStatus.PUBLISHED,
      authorId: admin.userId,
      timeLimitMin: options.timeLimitMin ?? 60,
      maxAttempts: options.maxAttempts ?? 1,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
}

async function makeAttempt(examId: string, status: AttemptStatus = AttemptStatus.IN_PROGRESS, extensionSec = 0) {
  const attemptNo = (await prisma.attempt.count({ where: { examId, userId: candidateId } })) + 1;
  const startedAt = new Date();
  return prisma.attempt.create({
    data: {
      examId,
      userId: candidateId,
      attemptNo,
      status,
      maxScore: 10,
      startedAt,
      timeExtensionSec: extensionSec,
      deadlineAt: new Date(startedAt.getTime() + 60 * 60_000 + extensionSec * 1000),
      submittedAt: status === AttemptStatus.IN_PROGRESS ? null : new Date(),
      score: status === AttemptStatus.GRADED ? 5 : null,
      percent: status === AttemptStatus.GRADED ? 50 : null,
      gradedAt: status === AttemptStatus.GRADED ? new Date() : null,
    },
    select: { id: true },
  });
}

describe.skipIf(!hasDb)("exam-day recovery", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: stamp, slug: stamp, kind: OrgKind.UNIVERSITY },
      select: { id: true },
    });
    orgId = org.id;
    const adminUser = await prisma.user.create({
      data: { orgId, name: "Admin", email: `${stamp}-admin@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    const officerUser = await prisma.user.create({
      data: { orgId, name: "Officer", email: `${stamp}-officer@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    const invigilatorUser = await prisma.user.create({
      data: { orgId, name: "Invigilator", email: `${stamp}-inv@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    const candidate = await prisma.user.create({
      data: { orgId, name: "Candidate", email: `${stamp}-cand@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    admin = actorFor(adminUser.id, Role.ORG_ADMIN);
    officer = actorFor(officerUser.id, Role.EXAM_OFFICER);
    invigilator = actorFor(invigilatorUser.id, Role.INVIGILATOR);
    candidateId = candidate.id;
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.examDayPolicy.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("refuses a restart while the policy has it switched off", async () => {
    await policy({ allowRestart: false });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id);

    await expect(restartAttempt(officer, attempt.id, { reason: "machine died" })).rejects.toThrow(/switched off/i);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.IN_PROGRESS);
  });

  it("voids the attempt and frees the candidate to sit again", async () => {
    await policy({ allowRestart: true });
    const exam = await makeExam({ maxAttempts: 1 });
    const attempt = await makeAttempt(exam.id);

    const result = await restartAttempt(officer, attempt.id, { reason: "power cut in the hall" });

    expect(result).toMatchObject({ voidedAttemptId: attempt.id, restartsUsed: 1, restartsAllowed: 1 });
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.VOIDED);
    // The attempt limit counts everything but voided attempts, so a slot is free.
    const counted = await prisma.attempt.count({
      where: { examId: exam.id, userId: candidateId, status: { not: AttemptStatus.VOIDED } },
    });
    expect(counted).toBe(0);
  });

  it("keeps the voided attempt on record with its reason", async () => {
    await policy({ allowRestart: true });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id);

    await restartAttempt(officer, attempt.id, { reason: "wrong candidate signed in" });

    const event = await prisma.proctorEvent.findFirst({ where: { attemptId: attempt.id, type: "attempt.restarted" } });
    expect(event?.payload).toMatchObject({ reason: "wrong candidate signed in" });
    const entry = await prisma.auditLog.findFirst({ where: { orgId, action: "attempt.restart", entityId: attempt.id } });
    expect(entry).not.toBeNull();
  });

  it("restarts a submitted attempt too, since a broken one is often force-submitted first", async () => {
    await policy({ allowRestart: true });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id, AttemptStatus.SUBMITTED);

    await restartAttempt(officer, attempt.id, { reason: "submitted by mistake" });

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.VOIDED);
  });

  it("restarts a marked attempt whose result is not out yet", async () => {
    // The common case: force-submitting an objective paper auto-grades it at once,
    // so a broken exam is usually already GRADED when someone asks to restart it.
    await policy({ allowRestart: true });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id, AttemptStatus.GRADED);

    const result = await restartAttempt(officer, attempt.id, { reason: "machine died, auto-submitted" });

    expect(result.withdrewReleasedResult).toBe(false);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.VOIDED);
  });

  it("refuses an invigilator on a result the candidate can already see", async () => {
    await policy({ allowRestart: true, invigilatorCanRestart: true });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id, AttemptStatus.GRADED);
    await prisma.attempt.update({ where: { id: attempt.id }, data: { releasedAt: new Date() } });

    await expect(restartAttempt(invigilator, attempt.id, { reason: "looked wrong" })).rejects.toThrow(
      /already been released/i,
    );
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.GRADED);
  });

  it("lets an exam officer restart a released result, withdrawing it", async () => {
    await policy({ allowRestart: true });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id, AttemptStatus.GRADED);
    await prisma.attempt.update({ where: { id: attempt.id }, data: { releasedAt: new Date() } });

    const result = await restartAttempt(officer, attempt.id, { reason: "sat the wrong paper" });

    expect(result.withdrewReleasedResult).toBe(true);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe(AttemptStatus.VOIDED);
    // The candidate can no longer see it.
    expect(after.releasedAt).toBeNull();
  });

  it("refuses a second restart when only one is allowed, and permits it when two are", async () => {
    await policy({ allowRestart: true, maxRestartsPerCandidate: 1 });
    const exam = await makeExam({ maxAttempts: 3 });
    const first = await makeAttempt(exam.id);
    await restartAttempt(officer, first.id, { reason: "first mishap" });
    const second = await makeAttempt(exam.id);

    await expect(restartAttempt(officer, second.id, { reason: "second mishap" })).rejects.toThrow(/which is the limit/i);

    await policy({ allowRestart: true, maxRestartsPerCandidate: 2 });
    await expect(restartAttempt(officer, second.id, { reason: "second mishap" })).resolves.toMatchObject({
      restartsUsed: 2,
    });
  });

  it("gates invigilators separately from exam officers", async () => {
    await policy({ allowRestart: true, invigilatorCanRestart: false });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id);

    await expect(restartAttempt(invigilator, attempt.id, { reason: "machine died" })).rejects.toThrow(
      /invigilators cannot restart/i,
    );

    await policy({ allowRestart: true, invigilatorCanRestart: true });
    await expect(restartAttempt(invigilator, attempt.id, { reason: "machine died" })).resolves.toMatchObject({
      voidedAttemptId: attempt.id,
    });
  });

  it("does not reach another organisation's attempt", async () => {
    await policy({ allowRestart: true });
    const other = await prisma.organization.create({
      data: { name: `${stamp}-other`, slug: `${stamp}-other`, kind: OrgKind.SCHOOL },
      select: { id: true },
    });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id);

    await expect(restartAttempt({ ...officer, orgId: other.id }, attempt.id, { reason: "poking" })).rejects.toThrow(
      /not found/i,
    );

    await prisma.organization.delete({ where: { id: other.id } });
  });

  it("caps added time per attempt, counting time already given", async () => {
    await policy({ maxExtraMinutesPerAttempt: 30 });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id, AttemptStatus.IN_PROGRESS, 20 * 60);

    await expect(extendAttempt(officer, attempt.id, { minutes: 20 })).rejects.toThrow(/You can add 10 more/);
    await expect(extendAttempt(officer, attempt.id, { minutes: 10 })).resolves.toMatchObject({
      deadlineAt: expect.any(String),
    });
  });

  it("stops invigilators adding time when the policy says so", async () => {
    await policy({ invigilatorCanExtend: false });
    const exam = await makeExam();
    const attempt = await makeAttempt(exam.id);

    await expect(extendAttempt(invigilator, attempt.id, { minutes: 5 })).rejects.toThrow(/invigilators cannot add time/i);
    await expect(extendAttempt(officer, attempt.id, { minutes: 5 })).resolves.toMatchObject({
      deadlineAt: expect.any(String),
    });
  });
});
