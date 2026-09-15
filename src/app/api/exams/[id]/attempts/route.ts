import { z } from "zod";
import { requireActor } from "@/server/authz";
import { clientIp, readJson, route } from "@/server/http";
import { startOrResumeAttempt } from "@/server/attempts/engine";

const bodySchema = z.object({
  deviceId: z.string().min(8).max(100),
  accessCode: z.string().trim().max(40).optional(),
});

// Start the candidate's attempt, or resume the one already in progress.
export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("attempt:take");
  const { id } = await params;
  const { deviceId, accessCode } = await readJson(request, bodySchema);
  const attempt = await startOrResumeAttempt(actor, id, { deviceId, ip: clientIp(request), userAgent: request.headers.get("user-agent") }, accessCode || undefined);
  return Response.json({ attempt });
});
