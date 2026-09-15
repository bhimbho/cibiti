import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { CourseRow } from "@/lib/course-table";
import type { TableParams } from "@/lib/table-params";
import { audit } from "../audit";
import type { Actor } from "../authz";
import { badRequest, conflict, notFound } from "../http";

export const courseSchema = z.object({
  code: z.string().trim().min(2).max(20).transform((c) => c.toUpperCase().replace(/\s+/g, "")),
  title: z.string().trim().min(3).max(160),
  credits: z.number().int().min(0).max(30).default(0),
  departmentId: z.string().min(1).nullish(),
  levelId: z.string().min(1).nullish(),
});

export const enrollmentSchema = z.union([
  z.object({ regNumbers: z.string().min(1).max(200_000) }),
  z.object({ userIds: z.array(z.string().min(1)).min(1).max(5000) }),
]);

const orderBy: Record<string, (dir: Prisma.SortOrder) => Prisma.CourseOrderByWithRelationInput> = {
  code: (dir) => ({ code: dir }),
  title: (dir) => ({ title: dir }),
};

export async function listCourses(actor: Actor, params: TableParams) {
  const where: Prisma.CourseWhereInput = {
    orgId: actor.orgId,
    ...(params.filters.department ? { departmentId: { in: params.filters.department } } : {}),
    ...(params.filters.level ? { levelId: { in: params.filters.level } } : {}),
    ...(params.q ? { OR: [{ code: { contains: params.q, mode: "insensitive" } }, { title: { contains: params.q, mode: "insensitive" } }] } : {}),
  };
  const sort = params.sort ?? { id: "code", desc: false };

  const [total, courses, departments, levels] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: [(orderBy[sort.id] ?? orderBy.code)(sort.desc ? "desc" : "asc"), { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        department: { select: { code: true } },
        level: { select: { name: true } },
        _count: { select: { enrollments: true, exams: { where: { deletedAt: null } } } },
      },
    }),
    prisma.department.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.level.findMany({ where: { orgId: actor.orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: CourseRow[] = courses.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    department: c.department?.code ?? null,
    level: c.level?.name ?? null,
    credits: c.credits,
    candidates: c._count.enrollments,
    exams: c._count.exams,
  }));

  return {
    rows,
    total,
    facets: {
      department: departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
      level: levels.map((l) => ({ value: l.id, label: l.name })),
    },
  };
}

async function validateCourseRefs(actor: Actor, input: z.infer<typeof courseSchema>) {
  if (input.departmentId && !(await prisma.department.count({ where: { id: input.departmentId, orgId: actor.orgId } }))) throw badRequest("Unknown department.");
  if (input.levelId && !(await prisma.level.count({ where: { id: input.levelId, orgId: actor.orgId } }))) throw badRequest("Unknown level.");
}

const courseConflict = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("A course with that code already exists.");
  throw error;
};

export async function createCourse(actor: Actor, input: z.infer<typeof courseSchema>) {
  await validateCourseRefs(actor, input);
  try {
    const course = await prisma.course.create({
      data: { orgId: actor.orgId, code: input.code, title: input.title, credits: input.credits, departmentId: input.departmentId ?? null, levelId: input.levelId ?? null },
      select: { id: true },
    });
    await audit({ actor, action: "course.create", entityType: "course", entityId: course.id, after: input });
    return course;
  } catch (error) {
    return courseConflict(error);
  }
}

export async function updateCourse(actor: Actor, id: string, input: z.infer<typeof courseSchema>) {
  const existing = await prisma.course.findFirst({ where: { id, orgId: actor.orgId } });
  if (!existing) throw notFound("Course");
  await validateCourseRefs(actor, input);
  try {
    await prisma.course.update({ where: { id }, data: { code: input.code, title: input.title, credits: input.credits, departmentId: input.departmentId ?? null, levelId: input.levelId ?? null } });
    await audit({ actor, action: "course.update", entityType: "course", entityId: id, before: { code: existing.code, title: existing.title }, after: input });
  } catch (error) {
    courseConflict(error);
  }
}

export async function deleteCourse(actor: Actor, id: string) {
  const course = await prisma.course.findFirst({ where: { id, orgId: actor.orgId }, include: { _count: { select: { exams: true } } } });
  if (!course) throw notFound("Course");
  if (course._count.exams) throw conflict("This course has exams. Remove the course from those exams first.");
  await prisma.course.delete({ where: { id } });
  await audit({ actor, action: "course.delete", entityType: "course", entityId: id, before: { code: course.code, title: course.title } });
}

export async function getCourseDetail(actor: Actor, id: string) {
  const course = await prisma.course.findFirst({
    where: { id, orgId: actor.orgId },
    include: {
      department: { select: { id: true, code: true, name: true } },
      level: { select: { id: true, name: true } },
      enrollments: {
        orderBy: { user: { name: "asc" } },
        include: { user: { select: { id: true, name: true, regNumber: true, isActive: true, level: { select: { name: true } } } } },
      },
      exams: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, status: true } },
    },
  });
  if (!course) return null;
  return {
    id: course.id,
    code: course.code,
    title: course.title,
    credits: course.credits,
    departmentId: course.department?.id ?? null,
    department: course.department ? `${course.department.code} · ${course.department.name}` : null,
    levelId: course.level?.id ?? null,
    level: course.level?.name ?? null,
    candidates: course.enrollments.map((e) => ({ userId: e.user.id, name: e.user.name, regNumber: e.user.regNumber, level: e.user.level?.name ?? null, active: e.user.isActive })),
    exams: course.exams,
  };
}

/** Register candidates on a course, either by pasted matric numbers or by user id. */
export async function enrollCandidates(actor: Actor, courseId: string, input: z.infer<typeof enrollmentSchema>) {
  if (!(await prisma.course.count({ where: { id: courseId, orgId: actor.orgId } }))) throw notFound("Course");

  let userIds: string[];
  let notFoundRegs: string[] = [];
  if ("regNumbers" in input) {
    const regs = [...new Set(input.regNumbers.split(/[\s,;]+/).map((r) => r.trim()).filter(Boolean))];
    if (regs.length > 5000) throw badRequest("Paste at most 5000 matric numbers at a time.");
    const users = await prisma.user.findMany({
      where: { orgId: actor.orgId, regNumber: { in: regs, mode: "insensitive" }, memberships: { some: { role: Role.CANDIDATE } } },
      select: { id: true, regNumber: true },
    });
    const found = new Set(users.map((u) => u.regNumber!.toLowerCase()));
    notFoundRegs = regs.filter((r) => !found.has(r.toLowerCase()));
    userIds = users.map((u) => u.id);
  } else {
    const users = await prisma.user.findMany({ where: { id: { in: input.userIds }, orgId: actor.orgId }, select: { id: true } });
    userIds = users.map((u) => u.id);
  }

  const currentTerm = await prisma.term.findFirst({ where: { session: { orgId: actor.orgId, isCurrent: true } }, orderBy: { order: "asc" }, select: { id: true } });
  const { count } = await prisma.enrollment.createMany({
    data: userIds.map((userId) => ({ userId, courseId, termId: currentTerm?.id ?? null })),
    skipDuplicates: true,
  });
  await audit({ actor, action: "course.enroll", entityType: "course", entityId: courseId, after: { added: count, requested: userIds.length } });
  return { added: count, alreadyEnrolled: userIds.length - count, notFound: notFoundRegs };
}

export async function unenrollCandidates(actor: Actor, courseId: string, userIds: string[]) {
  if (!(await prisma.course.count({ where: { id: courseId, orgId: actor.orgId } }))) throw notFound("Course");
  const { count } = await prisma.enrollment.deleteMany({ where: { courseId, userId: { in: userIds } } });
  await audit({ actor, action: "course.unenroll", entityType: "course", entityId: courseId, after: { removed: count } });
  return { removed: count };
}
