import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { createQuestion, questionInputSchema } from "@/server/questions/mutate";

export const POST = route(async (request: Request) => {
  const actor = await requireActor("question:write");
  const input = await readJson(request, questionInputSchema);
  return Response.json({ question: await createQuestion(actor, input) }, { status: 201 });
});
