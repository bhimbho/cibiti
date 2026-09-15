import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { forceSubmitAttempt, forceSubmitSchema } from "@/server/invigilation";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("invigilate");
  const input = await readJson(request, forceSubmitSchema);
  return Response.json(await forceSubmitAttempt(actor, (await params).id, input));
});
