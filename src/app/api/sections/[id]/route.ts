import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { deleteSection, sectionSchema, updateSection } from "@/server/exams/mutate";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  await updateSection(actor, (await params).id, await readJson(request, sectionSchema));
  return Response.json({ ok: true });
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  await deleteSection(actor, (await params).id);
  return Response.json({ ok: true });
});
