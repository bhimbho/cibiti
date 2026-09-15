import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { personSchema, updatePerson } from "@/server/people/mutate";

export const PUT = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("people:manage");
  const input = await readJson(request, personSchema);
  await updatePerson(actor, (await params).id, input);
  return Response.json({ ok: true });
});
