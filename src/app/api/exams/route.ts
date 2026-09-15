import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { createExam, examSettingsSchema } from "@/server/exams/mutate";

export const POST = route(async (request: Request) => {
  const actor = await requireActor("exam:write");
  const input = await readJson(request, examSettingsSchema);
  return Response.json({ exam: await createExam(actor, input) }, { status: 201 });
});
