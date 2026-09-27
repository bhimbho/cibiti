import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { componentsSchema, setCourseComponents } from "@/server/grades/components";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("academics:manage");
  const input = await readJson(request, componentsSchema);
  return Response.json(await setCourseComponents(actor, (await params).id, input));
});
