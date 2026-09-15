import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { setPeopleActive } from "@/server/people/mutate";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000), active: z.boolean() });

export const POST = route(async (request: Request) => {
  const actor = await requireActor("people:manage");
  const { ids, active } = await readJson(request, bodySchema);
  return Response.json(await setPeopleActive(actor, ids, active));
});
