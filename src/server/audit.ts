import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./authz";
import { toJson } from "./http";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntry = {
  actor: Pick<Actor, "userId" | "orgId"> & Partial<Pick<Actor, "viewAs">> | null;
  orgId?: string;
  action: string; // e.g. "exam.publish", "attempt.extend-time"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
};

function withRealActor(entry: AuditEntry): unknown {
  const viewAs = entry.actor?.viewAs;
  if (!viewAs) return entry.after;
  const via = { viewedAsBy: viewAs.realName, viewedAsById: viewAs.realUserId };
  return entry.after === undefined ? via : { ...(entry.after as Record<string, unknown>), ...via };
}

/** Record a privileged action. Pass the transaction client so the log commits with the change. */
export async function audit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      orgId: entry.orgId ?? entry.actor?.orgId,
      actorId: entry.actor?.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (toJson(entry.before) as Prisma.InputJsonValue),
      // An action taken while viewing as someone else records who was really there.
      // Viewing is read-only, so this should only ever appear on the view-as entries
      // themselves — if it turns up elsewhere, the read-only guard has a hole.
      after: withRealActor(entry) === undefined ? undefined : (toJson(withRealActor(entry)) as Prisma.InputJsonValue),
      ipAddress: entry.ipAddress ?? undefined,
    },
  });
}
