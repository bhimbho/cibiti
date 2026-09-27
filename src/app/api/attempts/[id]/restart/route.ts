import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { restartAttempt, restartSchema } from "@/server/exam-day/restart";

/**
 * `invigilate` is the floor of who may ask; the exam-day policy decides whether an
 * invigilator's request is actually allowed, and exam officers pass that check on
 * exam:publish instead.
 */
export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const input = await readJson(request, restartSchema);
  return Response.json(await restartAttempt(actor, (await params).id, input));
});
