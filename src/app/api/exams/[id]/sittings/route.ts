import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { addSitting, sittingSchema } from "@/server/exams/mutate";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  const input = await readJson(request, sittingSchema);
  return Response.json({ sitting: await addSitting(actor, (await params).id, input) }, { status: 201 });
});
