import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { getJobStatus } from "@/server/jobs";

export const GET = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  return Response.json({ job: await getJobStatus(actor, (await params).id) }, { headers: { "Cache-Control": "no-store" } });
});
