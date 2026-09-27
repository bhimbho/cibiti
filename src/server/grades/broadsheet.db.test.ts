/**
 * Database-backed tests for the course broadsheet: how components are weighted,
 * which attempt counts, what happens to unsat work, and the CSV a registry files.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { AttemptStatus, ExamStatus, OrgKind, PrismaClient, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../authz";
import { broadsheetCsvRows, courseBroadsheet } from "./broadsheet";
import { setCourseComponents } from "./components";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `sheetspec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let staff: Actor;
let ada = "";
let ben = "";

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

async function makeCourse(credits = 3) {
  return prisma.course.create({
    data: { orgId, code: `${stamp.slice(-6)}${Math.floor(Math.random() * 900 + 100)}`, title: "Test Course", credits },
    select: { id: true, code: true },
  });
}

async function makeExam(courseId: string, title: string) {
  return prisma.exam.create({
    data: { orgId, courseId, title: `${stamp} ${title}`, status: ExamStatus.PUBLISHED, authorId: staff.userId, publishedAt: new Date() },
    select: { id: true },
  });
}

async function gradedAttempt(examId: string, userId: string, percent: number, status: AttemptStatus = AttemptStatus.GRADED) {
  const attemptNo = (await prisma.attempt.count({ where: { examId, userId } })) + 1;
  await prisma.attempt.create({
    data: {
      examId,
      userId,
      attemptNo,
      status,
      maxScore: 100,
      score: status === AttemptStatus.GRADED ? percent : null,
      percent: status === AttemptStatus.GRADED ? percent : null,
      passed: status === AttemptStatus.GRADED ? percent >= 50 : null,
      submittedAt: new Date(),
      gradedAt: status === AttemptStatus.GRADED ? new Date() : null,
    },
  });
}

async function enrol(courseId: string, userIds: string[]) {
  await prisma.enrollment.createMany({ data: userIds.map((userId) => ({ userId, courseId })), skipDuplicates: true });
}

describe.skipIf(!hasDb)("course broadsheet", () => {
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
    const adaUser = await prisma.user.create({
      data: { orgId, name: "Ada Aku", regNumber: "TST/001", email: `${stamp}-ada@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    const benUser = await prisma.user.create({
      data: { orgId, name: "Ben Bello", regNumber: "TST/002", email: `${stamp}-ben@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    ada = adaUser.id;
    ben = benUser.id;
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.assessmentComponent.deleteMany({ where: { course: { orgId } } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.enrollment.deleteMany({ where: { course: { orgId } } });
    await prisma.course.deleteMany({ where: { orgId } });
    await prisma.gradeBand.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("weights components into a total and a grade", async () => {
    const course = await makeCourse();
    const ca = await makeExam(course.id, "CA");
    const final = await makeExam(course.id, "Final");
    await enrol(course.id, [ada, ben]);
    await setCourseComponents(staff, course.id, {
      components: [
        { name: "Continuous assessment", weightPct: 30, examId: ca.id },
        { name: "Examination", weightPct: 70, examId: final.id },
      ],
    });
    await gradedAttempt(ca.id, ada, 80);
    await gradedAttempt(final.id, ada, 50);

    const sheet = await courseBroadsheet(staff, course.id);
    const row = sheet.rows.find((r) => r.userId === ada)!;

    // (80·30 + 50·70) / 100 = 59 → C on the default scale.
    expect(row).toMatchObject({ total: 59, coverage: 100, grade: "C", gradePoint: 3 });
    expect(sheet.inferredColumns).toBe(false);
    expect(sheet.columns.map((c) => c.name)).toEqual(["Continuous assessment", "Examination"]);
  });

  it("drops the weight of work not yet sat and says how much the total covers", async () => {
    const course = await makeCourse();
    const ca = await makeExam(course.id, "CA only");
    const final = await makeExam(course.id, "Unsat final");
    await enrol(course.id, [ada]);
    await setCourseComponents(staff, course.id, {
      components: [
        { name: "CA", weightPct: 40, examId: ca.id },
        { name: "Exam", weightPct: 60, examId: final.id },
      ],
    });
    await gradedAttempt(ca.id, ada, 70);

    const sheet = await courseBroadsheet(staff, course.id);
    const row = sheet.rows[0];

    expect(row).toMatchObject({ total: 70, coverage: 40 });
    expect(row.parts).toEqual([70, null]);
  });

  it("takes a candidate's best graded attempt, not the latest", async () => {
    const course = await makeCourse();
    const exam = await makeExam(course.id, "Resat");
    await enrol(course.id, [ada]);
    await setCourseComponents(staff, course.id, { components: [{ name: "Exam", weightPct: 100, examId: exam.id }] });
    await gradedAttempt(exam.id, ada, 75);
    await gradedAttempt(exam.id, ada, 40);

    const sheet = await courseBroadsheet(staff, course.id);
    expect(sheet.rows[0].total).toBe(75);
  });

  it("ignores an attempt that is still being marked", async () => {
    const course = await makeCourse();
    const exam = await makeExam(course.id, "Awaiting");
    await enrol(course.id, [ada]);
    await setCourseComponents(staff, course.id, { components: [{ name: "Exam", weightPct: 100, examId: exam.id }] });
    await gradedAttempt(exam.id, ada, 90, AttemptStatus.SUBMITTED);

    const sheet = await courseBroadsheet(staff, course.id);
    expect(sheet.rows[0]).toMatchObject({ total: null, grade: null, coverage: 0 });
  });

  it("stands the course's exams in, equally weighted, when no components are set", async () => {
    const course = await makeCourse();
    const first = await makeExam(course.id, "Test one");
    const second = await makeExam(course.id, "Test two");
    await enrol(course.id, [ada]);
    await gradedAttempt(first.id, ada, 60);
    await gradedAttempt(second.id, ada, 80);

    const sheet = await courseBroadsheet(staff, course.id);

    expect(sheet.inferredColumns).toBe(true);
    expect(sheet.columns.map((c) => c.weightPct)).toEqual([50, 50]);
    expect(sheet.rows[0].total).toBe(70);
  });

  it("summarises the cohort and the course GPA", async () => {
    const course = await makeCourse(2);
    const exam = await makeExam(course.id, "Summary");
    await enrol(course.id, [ada, ben]);
    await setCourseComponents(staff, course.id, { components: [{ name: "Exam", weightPct: 100, examId: exam.id }] });
    await gradedAttempt(exam.id, ada, 80);
    await gradedAttempt(exam.id, ben, 30);

    const sheet = await courseBroadsheet(staff, course.id);

    expect(sheet.summary).toMatchObject({ candidates: 2, withMarks: 2, mean: 55, passRate: 50 });
    // A (5 points) and F (0), both 2 credits → 2.5.
    expect(sheet.summary.gpa).toBe(2.5);
  });

  it("refuses components whose weights do not add to 100", async () => {
    const course = await makeCourse();
    await expect(
      setCourseComponents(staff, course.id, { components: [{ name: "CA", weightPct: 30, examId: null }] }),
    ).rejects.toThrow(/add up to 30%/i);
  });

  it("refuses an exam that belongs to another course", async () => {
    const course = await makeCourse();
    const other = await makeCourse();
    const strayExam = await makeExam(other.id, "Elsewhere");
    await expect(
      setCourseComponents(staff, course.id, { components: [{ name: "Exam", weightPct: 100, examId: strayExam.id }] }),
    ).rejects.toThrow(/belongs to this course/i);
  });

  it("writes a CSV with a header, weights and one row per candidate", async () => {
    const course = await makeCourse();
    const exam = await makeExam(course.id, "CSV");
    await enrol(course.id, [ada, ben]);
    await setCourseComponents(staff, course.id, { components: [{ name: "Paper", weightPct: 100, examId: exam.id }] });
    await gradedAttempt(exam.id, ada, 72);

    const rows = broadsheetCsvRows(await courseBroadsheet(staff, course.id));

    expect(rows[0]).toEqual(["Candidate", "Matric number", "Paper (100%)", "Total (%)", "Grade", "Grade point"]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["Ada Aku", "TST/001", 72, 72, "A", 5]);
    // Ben sat nothing: blanks, not zeroes that would read as a fail.
    expect(rows[2]).toEqual(["Ben Bello", "TST/002", "", "", "", ""]);
  });

  it("does not reach another organisation's course", async () => {
    const other = await prisma.organization.create({
      data: { name: `${stamp}-other`, slug: `${stamp}-other`, kind: OrgKind.SCHOOL },
      select: { id: true },
    });
    const course = await makeCourse();

    await expect(courseBroadsheet({ ...staff, orgId: other.id }, course.id)).rejects.toThrow(/not found/i);

    await prisma.organization.delete({ where: { id: other.id } });
  });

  it("refuses a candidate", async () => {
    const course = await makeCourse();
    await expect(courseBroadsheet(actorFor(ada, Role.CANDIDATE), course.id)).rejects.toThrow(/permission/i);
  });
});
