import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditRow } from "@/lib/audit-table";
import type { TableParams } from "@/lib/table-params";
import type { Actor } from "./authz";

const summarise = (value: Prisma.JsonValue | null) => {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
};

export async function listAuditLog(actor: Actor, params: TableParams) {
  const { filters } = params;
  const where: Prisma.AuditLogWhereInput = {
    orgId: actor.orgId,
    ...(filters.action ? { action: { in: filters.action } } : {}),
    ...(filters.entityType ? { entityType: { in: filters.entityType } } : {}),
    ...(filters.actor ? { actorId: { in: filters.actor } } : {}),
    ...(params.q ? { OR: [{ entityId: { contains: params.q } }, { action: { contains: params.q, mode: "insensitive" } }] } : {}),
  };

  const [total, entries, actions, entityTypes, actors] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: params.sort?.desc === false ? "asc" : "desc" }, { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({ where: { orgId: actor.orgId }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ where: { orgId: actor.orgId }, distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    prisma.user.findMany({ where: { orgId: actor.orgId, auditLogs: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: AuditRow[] = entries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    actor: e.actor?.name ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: summarise(e.before),
    after: summarise(e.after),
    ipAddress: e.ipAddress,
  }));

  return {
    rows,
    total,
    facets: {
      action: actions.map((a) => ({ value: a.action, label: a.action })),
      entityType: entityTypes.map((t) => ({ value: t.entityType, label: t.entityType })),
      actor: actors.map((a) => ({ value: a.id, label: a.name })),
    },
  };
}
