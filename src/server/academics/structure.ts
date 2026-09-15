import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import type { Actor } from "../authz";
import { badRequest, conflict, notFound } from "../http";

// Departments, levels, groups, sessions, terms, venues and labs share one create/update/delete flow.

const dateString = z.iso.date().nullish();

export const structureSchemas = {
  departments: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(1).max(15).transform((c) => c.toUpperCase()) }),
  levels: z.object({ name: z.string().trim().min(1).max(40), order: z.number().int().min(0).max(100).default(0) }),
  groups: z.object({ name: z.string().trim().min(1).max(80), levelId: z.string().min(1).nullish() }),
  sessions: z.object({ name: z.string().trim().min(3).max(20), startsOn: dateString, endsOn: dateString }),
  terms: z.object({ sessionId: z.string().min(1), name: z.string().trim().min(1).max(60), order: z.number().int().min(0).max(20).default(0) }),
  venues: z.object({ name: z.string().trim().min(1).max(120) }),
  labs: z.object({ venueId: z.string().min(1), name: z.string().trim().min(1).max(80), capacity: z.number().int().min(0).max(5000).default(0) }),
} as const;

export type StructureKind = keyof typeof structureSchemas;
export const structureKinds = Object.keys(structureSchemas) as StructureKind[];

const entityType: Record<StructureKind, string> = {
  departments: "department",
  levels: "level",
  groups: "group",
  sessions: "session",
  terms: "term",
  venues: "venue",
  labs: "lab",
};

const toDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00Z`) : null);

async function assertParents(actor: Actor, kind: StructureKind, input: Record<string, unknown>) {
  if (kind === "groups" && input.levelId && !(await prisma.level.count({ where: { id: String(input.levelId), orgId: actor.orgId } }))) throw badRequest("Unknown level.");
  if (kind === "terms" && !(await prisma.academicSession.count({ where: { id: String(input.sessionId), orgId: actor.orgId } }))) throw badRequest("Unknown session.");
  if (kind === "labs" && !(await prisma.venue.count({ where: { id: String(input.venueId), orgId: actor.orgId } }))) throw badRequest("Unknown venue.");
}

/** Throws 404 unless the record exists and belongs to the actor's organisation. */
async function assertOwned(actor: Actor, kind: StructureKind, id: string) {
  const orgId = actor.orgId;
  const counts: Record<StructureKind, () => Promise<number>> = {
    departments: () => prisma.department.count({ where: { id, orgId } }),
    levels: () => prisma.level.count({ where: { id, orgId } }),
    groups: () => prisma.candidateGroup.count({ where: { id, orgId } }),
    sessions: () => prisma.academicSession.count({ where: { id, orgId } }),
    terms: () => prisma.term.count({ where: { id, session: { orgId } } }),
    venues: () => prisma.venue.count({ where: { id, orgId } }),
    labs: () => prisma.lab.count({ where: { id, venue: { orgId } } }),
  };
  if (!(await counts[kind]())) throw notFound(entityType[kind]);
}

function friendlyWriteError(error: unknown, kind: StructureKind): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw conflict(`A ${entityType[kind]} with that name${kind === "departments" ? " or code" : ""} already exists.`);
    if (error.code === "P2003") throw conflict(`This ${entityType[kind]} is still in use. Move or remove what uses it first.`);
  }
  throw error;
}

export async function createStructure(actor: Actor, kind: StructureKind, raw: unknown) {
  const input = structureSchemas[kind].parse(raw) as Record<string, unknown>;
  await assertParents(actor, kind, input);
  const orgId = actor.orgId;

  try {
    const created = await (async () => {
      switch (kind) {
        case "departments":
          return prisma.department.create({ data: { orgId, name: String(input.name), code: String(input.code) }, select: { id: true } });
        case "levels":
          return prisma.level.create({ data: { orgId, name: String(input.name), order: Number(input.order) }, select: { id: true } });
        case "groups":
          return prisma.candidateGroup.create({ data: { orgId, name: String(input.name), levelId: (input.levelId as string | null) ?? null }, select: { id: true } });
        case "sessions":
          return prisma.academicSession.create({ data: { orgId, name: String(input.name), startsOn: toDate(input.startsOn as string | null), endsOn: toDate(input.endsOn as string | null) }, select: { id: true } });
        case "terms":
          return prisma.term.create({ data: { sessionId: String(input.sessionId), name: String(input.name), order: Number(input.order) }, select: { id: true } });
        case "venues":
          return prisma.venue.create({ data: { orgId, name: String(input.name) }, select: { id: true } });
        case "labs":
          return prisma.lab.create({ data: { venueId: String(input.venueId), name: String(input.name), capacity: Number(input.capacity) }, select: { id: true } });
      }
    })();
    await audit({ actor, action: `${entityType[kind]}.create`, entityType: entityType[kind], entityId: created.id, after: input });
    return created;
  } catch (error) {
    friendlyWriteError(error, kind);
  }
}

export async function updateStructure(actor: Actor, kind: StructureKind, id: string, raw: unknown) {
  await assertOwned(actor, kind, id);
  const input = structureSchemas[kind].parse(raw) as Record<string, unknown>;
  await assertParents(actor, kind, input);

  try {
    switch (kind) {
      case "departments":
        await prisma.department.update({ where: { id }, data: { name: String(input.name), code: String(input.code) } });
        break;
      case "levels":
        await prisma.level.update({ where: { id }, data: { name: String(input.name), order: Number(input.order) } });
        break;
      case "groups":
        await prisma.candidateGroup.update({ where: { id }, data: { name: String(input.name), levelId: (input.levelId as string | null) ?? null } });
        break;
      case "sessions":
        await prisma.academicSession.update({ where: { id }, data: { name: String(input.name), startsOn: toDate(input.startsOn as string | null), endsOn: toDate(input.endsOn as string | null) } });
        break;
      case "terms":
        await prisma.term.update({ where: { id }, data: { name: String(input.name), order: Number(input.order) } });
        break;
      case "venues":
        await prisma.venue.update({ where: { id }, data: { name: String(input.name) } });
        break;
      case "labs":
        await prisma.lab.update({ where: { id }, data: { name: String(input.name), capacity: Number(input.capacity) } });
        break;
    }
    await audit({ actor, action: `${entityType[kind]}.update`, entityType: entityType[kind], entityId: id, after: input });
  } catch (error) {
    friendlyWriteError(error, kind);
  }
}

export async function deleteStructure(actor: Actor, kind: StructureKind, id: string) {
  await assertOwned(actor, kind, id);
  try {
    switch (kind) {
      case "departments":
        await prisma.department.delete({ where: { id } });
        break;
      case "levels":
        await prisma.level.delete({ where: { id } });
        break;
      case "groups":
        await prisma.candidateGroup.delete({ where: { id } });
        break;
      case "sessions":
        await prisma.academicSession.delete({ where: { id } });
        break;
      case "terms":
        await prisma.term.delete({ where: { id } });
        break;
      case "venues":
        await prisma.venue.delete({ where: { id } });
        break;
      case "labs":
        await prisma.lab.delete({ where: { id } });
        break;
    }
    await audit({ actor, action: `${entityType[kind]}.delete`, entityType: entityType[kind], entityId: id });
  } catch (error) {
    friendlyWriteError(error, kind);
  }
}

export async function setCurrentSession(actor: Actor, sessionId: string) {
  await assertOwned(actor, "sessions", sessionId);
  await prisma.$transaction([
    prisma.academicSession.updateMany({ where: { orgId: actor.orgId, isCurrent: true }, data: { isCurrent: false } }),
    prisma.academicSession.update({ where: { id: sessionId }, data: { isCurrent: true } }),
    prisma.auditLog.create({ data: { orgId: actor.orgId, actorId: actor.userId, action: "session.set-current", entityType: "session", entityId: sessionId } }),
  ]);
}

export async function getAcademicStructure(actor: Actor) {
  const orgId = actor.orgId;
  const [departments, levels, groups, sessions, venues] = await Promise.all([
    prisma.department.findMany({ where: { orgId }, orderBy: { code: "asc" }, include: { _count: { select: { courses: true, users: true } } } }),
    prisma.level.findMany({ where: { orgId }, orderBy: [{ order: "asc" }, { name: "asc" }], include: { _count: { select: { users: true, groups: true } } } }),
    prisma.candidateGroup.findMany({ where: { orgId }, orderBy: { name: "asc" }, include: { level: { select: { name: true } }, _count: { select: { members: true } } } }),
    prisma.academicSession.findMany({ where: { orgId }, orderBy: { name: "desc" }, include: { terms: { orderBy: { order: "asc" }, include: { _count: { select: { exams: true } } } } } }),
    prisma.venue.findMany({ where: { orgId }, orderBy: { name: "asc" }, include: { labs: { orderBy: { name: "asc" }, include: { _count: { select: { seats: true, sessions: true } } } } } }),
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return {
    departments: departments.map((d) => ({ id: d.id, name: d.name, code: d.code, courses: d._count.courses, people: d._count.users })),
    levels: levels.map((l) => ({ id: l.id, name: l.name, order: l.order, people: l._count.users, groups: l._count.groups })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, levelId: g.levelId, level: g.level?.name ?? null, members: g._count.members })),
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      startsOn: iso(s.startsOn),
      endsOn: iso(s.endsOn),
      isCurrent: s.isCurrent,
      terms: s.terms.map((t) => ({ id: t.id, name: t.name, order: t.order, exams: t._count.exams })),
    })),
    venues: venues.map((v) => ({
      id: v.id,
      name: v.name,
      labs: v.labs.map((l) => ({ id: l.id, name: l.name, capacity: l.capacity, seats: l._count.seats, sittings: l._count.sessions })),
    })),
  };
}

export type AcademicStructure = Awaited<ReturnType<typeof getAcademicStructure>>;
