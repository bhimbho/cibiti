import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { saveResponses } from "@/server/attempts/engine";

const bodySchema = z.object({
  deviceId: z.string().min(8).max(100),
  responses: z
    .array(
      z.object({
        itemId: z.string().min(1),
        value: z.unknown(),
        flagged: z.boolean().optional(),
        revision: z.number().int().min(1),
        timeSpentMs: z.number().int().min(0).optional(),
      }),
    )
    .max(300),
});

// Autosave. Also acts as a heartbeat: the response carries the current deadline and server time.
export const PUT = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("attempt:take");
  const { id } = await params;
  const { deviceId, responses } = await readJson(request, bodySchema);
  const result = await saveResponses(actor, id, deviceId, responses.map((r) => ({ ...r, value: r.value ?? null })));
  return Response.json(result);
});
