/**
 * Database-backed tests for the grading scale: the default until one is saved,
 * replacement as a set, permissions, and the grade reaching the results table.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { AttemptStatus, ExamStatus, OrgKind, PrismaClient, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";
import { DEFAULT_BANDS } from "./scale";
import { gradeBands, setGradeBands } from "./store";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `scalespec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let admin: Actor;
let officer: Actor;
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

describe.skipIf(!hasDb)("grading scale", () => {
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
    const candidate = await prisma.user.create({
      data: { orgId, name: "Candidate", email: `${stamp}-cand@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    candidateId = candidate.id;
    admin = actorFor(adminUser.id, Role.ORG_ADMIN);
    officer = actorFor(officerUser.id, Role.EXAM_OFFICER);
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.gradeBand.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("uses the default scale until one is saved", async () => {
    const scale = await gradeBands(orgId);
    expect(scale.isDefault).toBe(true);
    expect(scale.bands).toEqual(DEFAULT_BANDS);
  });

  it("saves a scale, ordered highest band first, and stops calling it the default", async () => {
    const saved = await setGradeBands(admin, {
      bands: [
        { label: "Pass", minPercent: 50, gradePoint: 1 },
        { label: "Distinction", minPercent: 75, gradePoint: 2 },
        { label: "Fail", minPercent: 0, gradePoint: 0 },
      ],
    });

    expect(saved.isDefault).toBe(false);
    expect(saved.bands.map((b) => b.label)).toEqual(["Distinction", "Pass", "Fail"]);
  });

  it("replaces the scale rather than adding to it", async () => {
    await setGradeBands(admin, {
      bands: [
        { label: "P", minPercent: 40, gradePoint: 1 },
        { label: "F", minPercent: 0, gradePoint: 0 },
      ],
    });

    const scale = await gradeBands(orgId);
    expect(scale.bands.map((b) => b.label)).toEqual(["P", "F"]);
  });

  it("refuses a scale that would leave scores ungraded", async () => {
    await expect(setGradeBands(admin, { bands: [{ label: "A", minPercent: 70, gradePoint: 5 }] })).rejects.toThrow(
      /lowest scores/i,
    );
  });

  it("refuses an exam officer, who does not administer the organisation", async () => {
    await expect(
      setGradeBands(officer, { bands: [{ label: "F", minPercent: 0, gradePoint: 0 }] }),
    ).rejects.toThrow(/administrator/i);
  });

  it("records the change in the audit log", async () => {
    await setGradeBands(admin, {
      bands: [
        { label: "A", minPercent: 80, gradePoint: 5 },
        { label: "F", minPercent: 0, gradePoint: 0 },
      ],
    });

    const entry = await prisma.auditLog.findFirst({
      where: { orgId, action: "grade-scale.set" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
  });

  it("puts the letter grade on the results table", async () => {
    const { listResults } = await import("../results/list");
    await setGradeBands(admin, {
      bands: [
        { label: "A", minPercent: 70, gradePoint: 5 },
        { label: "C", minPercent: 50, gradePoint: 3 },
        { label: "F", minPercent: 0, gradePoint: 0 },
      ],
    });
    const exam = await prisma.exam.create({
      data: { orgId, title: `${stamp} graded exam`, status: ExamStatus.PUBLISHED, authorId: admin.userId, publishedAt: new Date() },
      select: { id: true },
    });
    await prisma.attempt.create({
      data: {
        examId: exam.id,
        userId: candidateId,
        attemptNo: 1,
        status: AttemptStatus.GRADED,
        maxScore: 10,
        score: 6,
        percent: 60,
        passed: true,
        submittedAt: new Date(),
        gradedAt: new Date(),
      },
    });

    const { rows } = await listResults(officer, {
      page: 1,
      pageSize: 25,
      filters: { exam: [exam.id] },
      q: "",
      sort: null,
    });

    expect(rows).toHaveLength(1);
    // 60% sits in the C band of the scale just saved.
    expect(rows[0]).toMatchObject({ percent: 60, grade: "C" });
  });
});
