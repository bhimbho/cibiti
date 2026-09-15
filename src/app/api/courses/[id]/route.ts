import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { courseSchema, deleteCourse, updateCourse } from "@/server/academics/courses";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor("academics:manage");
  await updateCourse(actor, (await params).id, await readJson(request, courseSchema));
  return Response.json({ ok: true });
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("academics:manage");
  await deleteCourse(actor, (await params).id);
  return Response.json({ ok: true });
});
