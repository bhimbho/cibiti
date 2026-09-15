import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { removeRule } from "@/server/exams/mutate";

export const DELETE = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  await removeRule(actor, (await params).id);
  return Response.json({ ok: true });
});
