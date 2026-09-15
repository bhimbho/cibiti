import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { addItemsSchema, addQuestionsToSection } from "@/server/exams/mutate";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  const { questionIds } = await readJson(request, addItemsSchema);
  return Response.json(await addQuestionsToSection(actor, (await params).id, questionIds), { status: 201 });
});
