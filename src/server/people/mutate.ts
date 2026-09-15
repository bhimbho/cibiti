import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { can, type Actor } from "../authz";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { generatePassword, hashPassword } from "./passwords";

const officerGrantable: Role[] = [Role.CANDIDATE, Role.AUTHOR, Role.REVIEWER, Role.GRADER, Role.INVIGILATOR];

/** Administrators may grant any role except super admin; exam officers only non-administrative roles. */
export function grantableRoles(actor: Actor): Role[] {
  if (can(actor, "org:manage")) return Object.values(Role).filter((r) => r !== Role.SUPER_ADMIN);
  if (can(actor, "people:manage")) return officerGrantable;
  return [];
}

export const personSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the person's full name.").max(160),
    email: z.email("Enter a valid email address.").trim().toLowerCase().nullish().or(z.literal("").transform(() => null)),
    regNumber: z.string().trim().max(60).nullish().transform((v) => v || null),
    password: z.string().min(6, "Passwords need at least 6 characters.").max(200).nullish().or(z.literal("").transform(() => null)),
    roles: z.array(z.enum(Role)).min(1, "Choose at least one role."),
    departmentId: z.string().min(1).nullish(),
    levelId: z.string().min(1).nullish(),
    groupIds: z.array(z.string().min(1)).max(50).default([]),
    isActive: z.boolean().default(true),
  })
  .refine((p) => p.email || p.regNumber, { message: "Enter an email address or a matric/registration number so the person can sign in.", path: ["email"] });

export type PersonInput = z.infer<typeof personSchema>;

async function validateReferences(actor: Actor, input: PersonInput, userId?: string) {
  const allowed = grantableRoles(actor);
  const forbiddenRoles = input.roles.filter((r) => !allowed.includes(r));
  if (forbiddenRoles.length) throw forbidden(`You cannot grant: ${forbiddenRoles.join(", ").toLowerCase()}.`);

  if (input.departmentId && !(await prisma.department.count({ where: { id: input.departmentId, orgId: actor.orgId } }))) throw badRequest("Unknown department.");
  if (input.levelId && !(await prisma.level.count({ where: { id: input.levelId, orgId: actor.orgId } }))) throw badRequest("Unknown level.");
  if (input.groupIds.length && (await prisma.candidateGroup.count({ where: { id: { in: input.groupIds }, orgId: actor.orgId } })) !== new Set(input.groupIds).size) {
    throw badRequest("One of the groups could not be found.");
  }

  if (input.email) {
    const clash = await prisma.user.findFirst({ where: { email: input.email, ...(userId ? { id: { not: userId } } : {}) }, select: { id: true } });
    if (clash) throw conflict("Another account already uses that email address.");
  }
  if (input.regNumber) {
    const clash = await prisma.user.findFirst({
      where: { orgId: actor.orgId, regNumber: { equals: input.regNumber, mode: "insensitive" }, ...(userId ? { id: { not: userId } } : {}) },
      select: { id: true },
    });
    if (clash) throw conflict("Another account already uses that matric/registration number.");
  }
}

const publicFields = (input: PersonInput) => ({
  name: input.name,
  email: input.email ?? null,
  regNumber: input.regNumber ?? null,
  roles: [...input.roles].sort(),
  departmentId: input.departmentId ?? null,
  levelId: input.levelId ?? null,
  groupIds: [...input.groupIds].sort(),
  isActive: input.isActive,
});

export async function createPerson(actor: Actor, input: PersonInput) {
  await validateReferences(actor, input);
  const generated = input.password ? null : generatePassword();
  const passwordHash = await hashPassword(input.password ?? generated!);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId: actor.orgId,
          name: input.name,
          email: input.email ?? null,
          regNumber: input.regNumber ?? null,
          passwordHash,
          isActive: input.isActive,
          departmentId: input.departmentId ?? null,
          levelId: input.levelId ?? null,
          memberships: { create: [...new Set(input.roles)].map((role) => ({ orgId: actor.orgId, role })) },
          groupLinks: { create: input.groupIds.map((groupId) => ({ groupId })) },
        },
        select: { id: true },
      });
      await audit({ actor, action: "person.create", entityType: "user", entityId: user.id, after: publicFields(input) }, tx);
      return { id: user.id, generatedPassword: generated };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("That email or matric number is already in use.");
    throw error;
  }
}

export async function updatePerson(actor: Actor, userId: string, input: PersonInput) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, orgId: actor.orgId },
    include: { memberships: true, groupLinks: true },
  });
  if (!existing) throw notFound("Person");
  await validateReferences(actor, input, userId);

  const allowed = grantableRoles(actor);
  const currentOrgWide = existing.memberships.filter((m) => !m.departmentId && !m.courseId);
  // Roles this actor cannot grant are left untouched rather than silently removed.
  const untouchable = currentOrgWide.filter((m) => !allowed.includes(m.role)).map((m) => m.role);
  const nextRoles = [...new Set([...input.roles, ...untouchable])];

  if (userId === actor.userId) {
    if (!input.isActive) throw conflict("You cannot deactivate your own account.");
    const lostAdmin = actor.roles.some((r) => (r === Role.ORG_ADMIN || r === Role.SUPER_ADMIN) && !nextRoles.includes(r));
    if (lostAdmin) throw conflict("You cannot remove your own administrator role.");
  }

  const before = publicFields({
    name: existing.name,
    email: existing.email,
    regNumber: existing.regNumber,
    password: null,
    roles: currentOrgWide.map((m) => m.role),
    departmentId: existing.departmentId,
    levelId: existing.levelId,
    groupIds: existing.groupLinks.map((g) => g.groupId),
    isActive: existing.isActive,
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        email: input.email ?? null,
        regNumber: input.regNumber ?? null,
        isActive: input.isActive,
        departmentId: input.departmentId ?? null,
        levelId: input.levelId ?? null,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    await tx.membership.deleteMany({ where: { userId, departmentId: null, courseId: null, role: { notIn: nextRoles } } });
    const have = new Set(currentOrgWide.map((m) => m.role));
    const add = nextRoles.filter((r) => !have.has(r));
    if (add.length) await tx.membership.createMany({ data: add.map((role) => ({ userId, orgId: actor.orgId, role })) });
    await tx.groupMember.deleteMany({ where: { userId, groupId: { notIn: input.groupIds } } });
    if (input.groupIds.length) await tx.groupMember.createMany({ data: input.groupIds.map((groupId) => ({ userId, groupId })), skipDuplicates: true });
    await audit({ actor, action: "person.update", entityType: "user", entityId: userId, before, after: { ...publicFields({ ...input, roles: nextRoles }), passwordChanged: Boolean(input.password) } }, tx);
  });
}

export async function resetPassword(actor: Actor, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, orgId: actor.orgId }, include: { memberships: { select: { role: true } } } });
  if (!user) throw notFound("Person");
  const allowed = grantableRoles(actor);
  if (user.memberships.some((m) => !allowed.includes(m.role))) throw forbidden("You cannot reset the password of an account with higher privileges.");
  const password = generatePassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
    await audit({ actor, action: "person.reset-password", entityType: "user", entityId: userId }, tx);
  });
  return { password };
}

export async function setPeopleActive(actor: Actor, userIds: string[], active: boolean) {
  const ids = userIds.filter((id) => id !== actor.userId);
  const allowed = grantableRoles(actor);
  const users = await prisma.user.findMany({ where: { id: { in: ids }, orgId: actor.orgId, isActive: !active }, include: { memberships: { select: { role: true } } } });
  const permitted = users.filter((u) => u.memberships.every((m) => allowed.includes(m.role)));

  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: { in: permitted.map((u) => u.id) } }, data: { isActive: active } }),
    prisma.auditLog.createMany({
      data: permitted.map((u) => ({ orgId: actor.orgId, actorId: actor.userId, action: active ? "person.activate" : "person.deactivate", entityType: "user", entityId: u.id, before: { isActive: !active }, after: { isActive: active } })),
    }),
  ]);
  return { updated: permitted.length, skipped: userIds.length - permitted.length };
}

export const accommodationSchema = z.object({ extraTimePct: z.number().int().min(0).max(200), notes: z.string().trim().max(500).nullish() });

/** The organisation-wide accommodation (applies to every exam) for a candidate. */
export async function setAccommodation(actor: Actor, userId: string, input: z.infer<typeof accommodationSchema>) {
  if (!(await prisma.user.count({ where: { id: userId, orgId: actor.orgId } }))) throw notFound("Person");
  const existing = await prisma.accommodation.findFirst({ where: { userId, examId: null } });
  await prisma.$transaction(async (tx) => {
    if (existing) await tx.accommodation.update({ where: { id: existing.id }, data: { extraTimePct: input.extraTimePct, notes: input.notes || null } });
    else await tx.accommodation.create({ data: { userId, extraTimePct: input.extraTimePct, notes: input.notes || null } });
    await audit({ actor, action: "person.accommodation", entityType: "user", entityId: userId, before: existing ? { extraTimePct: existing.extraTimePct } : null, after: { extraTimePct: input.extraTimePct } }, tx);
  });
}

export async function getPersonForEditing(actor: Actor, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId: actor.orgId },
    include: {
      memberships: { select: { role: true, departmentId: true, courseId: true } },
      groupLinks: { select: { groupId: true } },
      enrollments: { include: { course: { select: { id: true, code: true, title: true } } }, orderBy: { enrolledAt: "desc" } },
      accommodations: { where: { examId: null }, take: 1 },
      attempts: { orderBy: { startedAt: "desc" }, take: 10, include: { exam: { select: { title: true } } } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    input: {
      name: user.name,
      email: user.email,
      regNumber: user.regNumber,
      roles: [...new Set(user.memberships.filter((m) => !m.departmentId && !m.courseId).map((m) => m.role))],
      departmentId: user.departmentId,
      levelId: user.levelId,
      groupIds: user.groupLinks.map((g) => g.groupId),
      isActive: user.isActive,
    },
    enrollments: user.enrollments.map((e) => ({ id: e.id, courseId: e.course.id, code: e.course.code, title: e.course.title })),
    accommodation: user.accommodations[0] ? { extraTimePct: user.accommodations[0].extraTimePct, notes: user.accommodations[0].notes } : { extraTimePct: 0, notes: null },
    attempts: user.attempts.map((a) => ({ id: a.id, exam: a.exam.title, status: a.status, percent: a.releasedAt ? a.percent : a.percent, startedAt: a.startedAt.toISOString() })),
  };
}

export async function peopleFormOptions(actor: Actor) {
  const [departments, levels, groups] = await Promise.all([
    prisma.department.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.level.findMany({ where: { orgId: actor.orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.candidateGroup.findMany({ where: { orgId: actor.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    departments: departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
    levels: levels.map((l) => ({ value: l.id, label: l.name })),
    groups: groups.map((g) => ({ value: g.id, label: g.name })),
    roles: grantableRoles(actor),
  };
}
