import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./authz";
import { toJson } from "./http";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntry = {
  actor: Pick<Actor, "userId" | "orgId"> | null;
  orgId?: string;
  action: string; // e.g. "exam.publish", "attempt.extend-time"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
};

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
      after: entry.after === undefined ? undefined : (toJson(entry.after) as Prisma.InputJsonValue),
      ipAddress: entry.ipAddress ?? undefined,
    },
  });
}
