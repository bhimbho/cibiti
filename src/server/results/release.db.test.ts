/**
 * Database-backed tests for result release. The rules that matter here are in
 * queries — which attempts a release touches, and what a policy change does to
 * results already out — so they cannot be covered by the pure tests in
 * release-policy.test.ts.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { AttemptStatus, ExamStatus, OrgKind, PrismaClient, ReleasePolicy, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);

/** Unique per run so repeated runs (and parallel CI jobs) cannot collide. */
const stamp = `relspec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let staff: Actor;
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

async function makeExam(policy: ReleasePolicy, status: ExamStatus = ExamStatus.PUBLISHED) {
  return prisma.exam.create({
    data: {
      orgId,
      title: `${stamp} ${policy}`,
      status,
      authorId: staff.userId,
      releasePolicy: policy,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
}

/** A graded, unreleased attempt — the state the release button acts on. */
async function makeGradedAttempt(examId: string, releasedAt: Date | null = null) {
  return prisma.attempt.create({
    data: {
      examId,
      userId: candidateId,
      attemptNo: 1,
      status: AttemptStatus.GRADED,
      maxScore: 10,
      score: 8,
      percent: 80,
      passed: true,
      submittedAt: new Date(),
      gradedAt: new Date(),
      releasedAt,
    },
    select: { id: true },
  });
}

describe.skipIf(!hasDb)("result release", () => {
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
    const candidate = await prisma.user.create({
      data: { orgId, name: "Candidate", email: `${stamp}-candidate@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    candidateId = candidate.id;
    staff = actorFor(officer.id, Role.EXAM_OFFICER);
  });

  afterAll(async () => {
    // Children first: attempts and exams reference the org's users.
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("releases a graded attempt on a MANUAL exam", async () => {
    const { releaseResults } = await import("./report");
    const exam = await makeExam(ReleasePolicy.MANUAL);
    const attempt = await makeGradedAttempt(exam.id);

    const result = await releaseResults(staff, [attempt.id]);

    expect(result).toMatchObject({ released: 1, withheld: 0 });
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.releasedAt).not.toBeNull();
  });

  it("withholds attempts on a NEVER exam instead of releasing them", async () => {
    const { releaseResults } = await import("./report");
    const exam = await makeExam(ReleasePolicy.NEVER);
    const attempt = await makeGradedAttempt(exam.id);

    const result = await releaseResults(staff, [attempt.id]);

    expect(result).toMatchObject({ released: 0, withheld: 1 });
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.releasedAt).toBeNull();
  });

  it("refuses releaseAllForExam on a NEVER exam", async () => {
    const { releaseAllForExam } = await import("./report");
    const exam = await makeExam(ReleasePolicy.NEVER);
    await makeGradedAttempt(exam.id);

    await expect(releaseAllForExam(staff, exam.id)).rejects.toThrow(/never to show results/i);
  });

  it("releases marked results when an AFTER_CLOSE exam is closed", async () => {
    const { closeExam } = await import("../exams/mutate");
    const exam = await makeExam(ReleasePolicy.AFTER_CLOSE);
    const attempt = await makeGradedAttempt(exam.id);

    const result = await closeExam(staff, exam.id);

    expect(result.status).toBe(ExamStatus.CLOSED);
    expect(result.released).toBe(1);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.releasedAt).not.toBeNull();
  });

  it("leaves results unreleased when a MANUAL exam is closed", async () => {
    const { closeExam } = await import("../exams/mutate");
    const exam = await makeExam(ReleasePolicy.MANUAL);
    const attempt = await makeGradedAttempt(exam.id);

    const result = await closeExam(staff, exam.id);

    expect(result.released).toBe(0);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.releasedAt).toBeNull();
  });

  it("takes released results back when the exam switches to NEVER", async () => {
    const { withdrawResultsForExam } = await import("./report");
    const exam = await makeExam(ReleasePolicy.IMMEDIATE);
    const attempt = await makeGradedAttempt(exam.id, new Date());

    const result = await withdrawResultsForExam(exam.id, orgId, staff.userId);

    expect(result.withdrawn).toBe(1);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.releasedAt).toBeNull();
  });

  it("hides a withheld score from the candidate and marks it withheld", async () => {
    const { candidateOverview } = await import("../candidate");
    const exam = await makeExam(ReleasePolicy.NEVER);
    await makeGradedAttempt(exam.id);

    const overview = await candidateOverview(actorFor(candidateId, Role.CANDIDATE));
    const mine = overview.history.find((h) => h.examTitle === `${stamp} ${ReleasePolicy.NEVER}`);

    expect(mine).toBeDefined();
    expect(mine?.percent).toBeNull();
    expect(mine?.withheld).toBe(true);
  });

  it("refuses a candidate's own report while the result is withheld", async () => {
    const { getAttemptReport } = await import("./report");
    const exam = await makeExam(ReleasePolicy.NEVER);
    const attempt = await makeGradedAttempt(exam.id);

    await expect(getAttemptReport(actorFor(candidateId, Role.CANDIDATE), attempt.id)).rejects.toThrow(
      /not been released/i,
    );
  });
});
