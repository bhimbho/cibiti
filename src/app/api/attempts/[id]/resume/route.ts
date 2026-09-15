import { z } from "zod";
import { requireActor } from "@/server/authz";
import { clientIp, readJson, route } from "@/server/http";
import { resumeAttempt } from "@/server/attempts/engine";

const bodySchema = z.object({ deviceId: z.string().min(8).max(100) });

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("attempt:take");
  const { id } = await params;
  const { deviceId } = await readJson(request, bodySchema);
  const attempt = await resumeAttempt(actor, id, { deviceId, ip: clientIp(request), userAgent: request.headers.get("user-agent") });
  return Response.json({ attempt });
});
