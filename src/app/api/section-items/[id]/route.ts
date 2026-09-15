import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { removeSectionItem, updateItemSchema, updateSectionItem } from "@/server/exams/mutate";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  await updateSectionItem(actor, (await params).id, await readJson(request, updateItemSchema));
  return Response.json({ ok: true });
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  await removeSectionItem(actor, (await params).id);
  return Response.json({ ok: true });
});
