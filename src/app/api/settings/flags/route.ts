import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { flagUpdateSchema, setOrgFlag } from "@/server/settings";

export const PUT = route(async (request: Request) => {
  const actor = await requireActor("flags:manage");
  const { key, enabled } = await readJson(request, flagUpdateSchema);
  return Response.json(await setOrgFlag(actor, key, enabled));
});
