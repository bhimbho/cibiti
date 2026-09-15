import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { extendAttempt, extendSchema } from "@/server/invigilation";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("invigilate");
  const input = await readJson(request, extendSchema);
  return Response.json(await extendAttempt(actor, (await params).id, input));
});
