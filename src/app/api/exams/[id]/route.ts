import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { deleteExam, examSettingsSchema, updateExamSettings } from "@/server/exams/mutate";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  const input = await readJson(request, examSettingsSchema);
  return Response.json(await updateExamSettings(actor, (await params).id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("exam:write");
  await deleteExam(actor, (await params).id);
  return Response.json({ ok: true });
});
