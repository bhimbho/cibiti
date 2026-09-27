import { ImpersonationMode } from "@prisma/client";
import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { setImpersonationMode } from "@/server/impersonation";

const bodySchema = z.object({ mode: z.enum(ImpersonationMode) });

export const PUT = route(async (request: Request) => {
  const actor = await requireActor("org:manage");
  const { mode } = await readJson(request, bodySchema);
  return Response.json(await setImpersonationMode(actor, mode));
});
