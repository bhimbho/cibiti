import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { enrollCandidates, enrollmentSchema, unenrollCandidates } from "@/server/academics/courses";

type Context = { params: Promise<{ id: string }> };

// Register candidates by pasted matric numbers ({ regNumbers }) or by id ({ userIds }).
export const POST = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("academics:manage");
  const input = await readJson(request, enrollmentSchema);
  return Response.json(await enrollCandidates(actor, (await params).id, input));
});

const removeSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(5000) });

export const DELETE = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("academics:manage");
  const { userIds } = await readJson(request, removeSchema);
  return Response.json(await unenrollCandidates(actor, (await params).id, userIds));
});
