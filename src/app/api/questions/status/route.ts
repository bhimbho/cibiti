import { QuestionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can, requireActor } from "@/server/authz";
import { clientIp, forbidden, readJson, route } from "@/server/http";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  status: z.enum(QuestionStatus),
});

// Bulk status change. Approving or retiring needs review rights; moving to draft/review needs authoring rights.
export const PATCH = route(async (request: Request) => {
  const actor = await requireActor();
  const { ids, status } = await readJson(request, bodySchema);

  const needed = status === QuestionStatus.APPROVED || status === QuestionStatus.RETIRED ? "question:review" : "question:write";
  // Questions are organisation-wide for now, so an org-wide grant is required.
  if (!can(actor, needed)) throw forbidden(needed === "question:review" ? "Only reviewers can approve or retire questions." : undefined);

  const questions = await prisma.question.findMany({ where: { id: { in: ids }, orgId: actor.orgId, deletedAt: null }, select: { id: true, status: true } });
  const changing = questions.filter((q) => q.status !== status);
  const ip = clientIp(request);

  await prisma.$transaction([
    prisma.question.updateMany({ where: { id: { in: changing.map((q) => q.id) } }, data: { status } }),
    prisma.auditLog.createMany({
      data: changing.map((q) => ({
        orgId: actor.orgId,
        actorId: actor.userId,
        action: "question.status",
        entityType: "question",
        entityId: q.id,
        before: { status: q.status },
        after: { status },
        ipAddress: ip,
      })),
    }),
  ]);

  return Response.json({ updated: changing.length, unchanged: questions.length - changing.length, notFound: ids.length - questions.length });
});
