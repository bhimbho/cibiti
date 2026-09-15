import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAnywhere, requireActor } from "@/server/authz";
import { conflict, forbidden, notFound, readJson, route } from "@/server/http";

const createSchema = z.object({ name: z.string().trim().min(2).max(120) });

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  if (!canAnywhere(actor, "question:write") && !canAnywhere(actor, "academics:manage")) throw forbidden();
  const { id } = await params;
  const subject = await prisma.subject.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
  if (!subject) throw notFound("Subject");
  const { name } = await readJson(request, createSchema);

  // Postgres treats NULL parentIds as distinct, so check top-level duplicates explicitly.
  if (await prisma.topic.count({ where: { subjectId: id, parentId: null, name: { equals: name, mode: "insensitive" } } })) {
    throw conflict("That topic already exists in this subject.");
  }
  try {
    const topic = await prisma.topic.create({ data: { subjectId: id, name }, select: { id: true, name: true } });
    return Response.json({ topic }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("That topic already exists in this subject.");
    throw error;
  }
});
