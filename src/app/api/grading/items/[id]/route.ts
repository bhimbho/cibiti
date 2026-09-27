import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { gradeItem, gradeItemSchema } from "@/server/grading/queue";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("grade:write");
  const input = await readJson(request, gradeItemSchema);
  return Response.json(await gradeItem(actor, (await params).id, input));
});
