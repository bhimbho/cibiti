import { AttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { requireActor } from "@/server/authz";
import { clientIp, conflict, notFound, route } from "@/server/http";

// Invigilator approves moving an in-progress attempt to another computer (crash, power cut).
export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("invigilate");
  const { id } = await params;

  const attempt = await prisma.attempt.findFirst({ where: { id, exam: { orgId: actor.orgId } }, select: { id: true, status: true, activeDeviceId: true } });
  if (!attempt) throw notFound("Attempt");
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw conflict("Only an in-progress attempt can be moved to another computer.");

  await prisma.$transaction(async (tx) => {
    await tx.attempt.update({ where: { id }, data: { activeDeviceId: null } });
    await tx.proctorEvent.create({ data: { attemptId: id, type: "device.released", severity: "INFO", payload: { by: actor.userId } } });
    await audit({ actor, action: "attempt.release-device", entityType: "attempt", entityId: id, before: { activeDeviceId: attempt.activeDeviceId }, after: { activeDeviceId: null }, ipAddress: clientIp(request) }, tx);
  });

  return Response.json({ ok: true });
});
