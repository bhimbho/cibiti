import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { recordableEventTypes, recordEvents } from "@/server/attempts/engine";

const bodySchema = z.object({
  deviceId: z.string().min(8).max(100),
  events: z
    .array(
      z.object({
        type: z.enum(recordableEventTypes),
        clientAt: z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp.").optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("attempt:take");
  const { id } = await params;
  const { deviceId, events } = await readJson(request, bodySchema);
  return Response.json(await recordEvents(actor, id, deviceId, events));
});
