import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { accommodationSchema, setAccommodation } from "@/server/people/mutate";

export const PUT = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("people:manage");
  await setAccommodation(actor, (await params).id, await readJson(request, accommodationSchema));
  return Response.json({ ok: true });
});
