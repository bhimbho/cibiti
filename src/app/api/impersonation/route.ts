import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { startImpersonation, stopImpersonation } from "@/server/impersonation";

const startSchema = z.object({ userId: z.string().min(1) });

/** Start viewing as another user. Only an administrator's own session can do this. */
export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  // While already viewing as someone, the actor is the target — who is not an
  // administrator — so this refuses itself without a special case.
  const input = await readJson(request, startSchema);
  return Response.json(await startImpersonation(actor, input.userId));
});

/** Stop, and go back to being yourself. */
export const DELETE = route(async () => {
  const actor = await requireActor();
  return Response.json(
    await stopImpersonation(
      actor.viewAs ? { userId: actor.viewAs.realUserId, orgId: actor.orgId } : null,
      actor.userId,
    ),
  );
});
