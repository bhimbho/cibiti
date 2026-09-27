import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { examDayPolicySchema, setExamDayPolicy } from "@/server/exam-day/store";

export const PUT = route(async (request: Request) => {
  const actor = await requireActor("org:manage");
  const input = await readJson(request, examDayPolicySchema);
  return Response.json(await setExamDayPolicy(actor, input));
});
