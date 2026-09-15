import { requireActor } from "@/server/authz";
import { badRequest, notFound, route } from "@/server/http";
import { deleteStructure, setCurrentSession, structureKinds, updateStructure, type StructureKind } from "@/server/academics/structure";

type Context = { params: Promise<{ kind: string; id: string }> };

async function resolve(context: Context) {
  const { kind, id } = await context.params;
  if (!structureKinds.includes(kind as StructureKind)) throw notFound("Page");
  return { kind: kind as StructureKind, id };
}

export const PUT = route(async (request: Request, context: Context) => {
  const actor = await requireActor("academics:manage");
  const { kind, id } = await resolve(context);
  await updateStructure(actor, kind, id, await request.json().catch(() => undefined));
  return Response.json({ ok: true });
});

// PATCH /api/academics/sessions/{id} with { action: "make-current" }
export const PATCH = route(async (request: Request, context: Context) => {
  const actor = await requireActor("academics:manage");
  const { kind, id } = await resolve(context);
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (kind !== "sessions" || body.action !== "make-current") throw badRequest("Unsupported action.");
  await setCurrentSession(actor, id);
  return Response.json({ ok: true });
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const actor = await requireActor("academics:manage");
  const { kind, id } = await resolve(context);
  await deleteStructure(actor, kind, id);
  return Response.json({ ok: true });
});
