import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { createPerson, personSchema } from "@/server/people/mutate";

export const POST = route(async (request: Request) => {
  const actor = await requireActor("people:manage");
  const input = await readJson(request, personSchema);
  return Response.json({ person: await createPerson(actor, input) }, { status: 201 });
});
