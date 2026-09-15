import { requireActor } from "@/server/authz";
import { notFound, route } from "@/server/http";
import { createStructure, structureKinds, type StructureKind } from "@/server/academics/structure";

// POST /api/academics/{departments|levels|groups|sessions|terms|venues|labs}
export const POST = route(async (request: Request, { params }: { params: Promise<{ kind: string }> }) => {
  const actor = await requireActor("academics:manage");
  const { kind } = await params;
  if (!structureKinds.includes(kind as StructureKind)) throw notFound("Page");
  const body = await request.json().catch(() => undefined);
  const created = await createStructure(actor, kind as StructureKind, body);
  return Response.json({ id: created.id }, { status: 201 });
});
