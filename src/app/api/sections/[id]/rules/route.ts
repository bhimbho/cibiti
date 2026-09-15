import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { addRule, ruleSchema } from "@/server/exams/mutate";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  const input = await readJson(request, ruleSchema);
  return Response.json({ rule: await addRule(actor, (await params).id, input) }, { status: 201 });
});
