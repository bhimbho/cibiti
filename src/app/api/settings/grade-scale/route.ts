import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { gradeScaleSchema, setGradeBands } from "@/server/grades/store";

export const PUT = route(async (request: Request) => {
  const actor = await requireActor("org:manage");
  const input = await readJson(request, gradeScaleSchema);
  return Response.json(await setGradeBands(actor, input));
});
