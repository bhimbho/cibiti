import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { courseSchema, createCourse } from "@/server/academics/courses";

export const POST = route(async (request: Request) => {
  const actor = await requireActor("academics:manage");
  const input = await readJson(request, courseSchema);
  return Response.json({ course: await createCourse(actor, input) }, { status: 201 });
});
