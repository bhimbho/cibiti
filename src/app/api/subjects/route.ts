import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { canAnywhere, requireActor } from "@/server/authz";
import { conflict, forbidden, readJson, route } from "@/server/http";
import { listSubjects } from "@/server/questions/mutate";

export const GET = route(async () => {
  const actor = await requireActor("question:read");
  return Response.json({ subjects: await listSubjects(actor.orgId) });
});

const createSchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().max(20).optional() });

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  if (!canAnywhere(actor, "question:write") && !canAnywhere(actor, "academics:manage")) throw forbidden();
  const { name, code } = await readJson(request, createSchema);
  try {
    const subject = await prisma.subject.create({ data: { orgId: actor.orgId, name, code: code || null }, select: { id: true, name: true, code: true } });
    await audit({ actor, action: "subject.create", entityType: "subject", entityId: subject.id, after: subject });
    return Response.json({ subject: { ...subject, topics: [] } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("A subject with that name already exists.");
    throw error;
  }
});
