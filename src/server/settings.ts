import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "./audit";
import type { Actor } from "./authz";
import { FLAGS, flagCatalog, type FlagKey } from "./flags";

const flagKeys = Object.values(FLAGS) as [FlagKey, ...FlagKey[]];

export const flagUpdateSchema = z.object({ key: z.enum(flagKeys), enabled: z.boolean() });

export async function getOrgSettings(actor: Actor) {
  const [org, rows, counts] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { name: true, slug: true, kind: true, createdAt: true } }),
    prisma.featureFlag.findMany({ where: { orgId: actor.orgId, examId: null }, select: { key: true, enabled: true } }),
    prisma.featureFlag.groupBy({ by: ["key"], where: { orgId: actor.orgId, examId: { not: null }, enabled: true }, _count: { _all: true } }),
  ]);
  const enabled = new Map(rows.map((r) => [r.key, r.enabled]));
  const examOverrides = new Map(counts.map((c) => [c.key, c._count._all]));

  return {
    org: { ...org, createdAt: org.createdAt.toISOString() },
    flags: flagKeys.map((key) => ({ key, ...flagCatalog[key], enabled: enabled.get(key) ?? false, examOverrides: examOverrides.get(key) ?? 0 })),
  };
}

/** Organisation-wide switch. Exam-level rows (if any) still override it for their exam. */
export async function setOrgFlag(actor: Actor, key: FlagKey, enabled: boolean) {
  // Prisma cannot target a compound unique containing NULL, so find the org-level row explicitly.
  const existing = await prisma.featureFlag.findFirst({ where: { orgId: actor.orgId, examId: null, key } });
  if (existing?.enabled === enabled) return { key, enabled };

  await prisma.$transaction(async (tx) => {
    if (existing) await tx.featureFlag.update({ where: { id: existing.id }, data: { enabled } });
    else await tx.featureFlag.create({ data: { orgId: actor.orgId, key, enabled } });
    await audit({ actor, action: "flag.set", entityType: "feature-flag", entityId: key, before: { enabled: existing?.enabled ?? false }, after: { enabled } }, tx);
  });
  return { key, enabled };
}
