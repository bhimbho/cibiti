import { requireActor } from "@/server/authz";
import { notFound, readJson, route } from "@/server/http";
import { deleteQuestion, getQuestionForEditing, questionInputSchema, updateQuestion } from "@/server/questions/mutate";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("question:read");
  const question = await getQuestionForEditing(actor, (await params).id);
  if (!question) throw notFound("Question");
  return Response.json({ question });
});

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("question:write");
  const input = await readJson(request, questionInputSchema);
  return Response.json({ question: await updateQuestion(actor, (await params).id, input) });
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("question:write");
  await deleteQuestion(actor, (await params).id);
  return Response.json({ ok: true });
});
