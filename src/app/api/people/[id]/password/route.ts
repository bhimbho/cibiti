import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { resetPassword } from "@/server/people/mutate";

// Generates a new password and returns it once. It is never stored in plain text.
export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("people:manage");
  return Response.json(await resetPassword(actor, (await params).id), { headers: { "Cache-Control": "no-store" } });
});
