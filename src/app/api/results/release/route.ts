import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { releaseAllForExam, releaseResults } from "@/server/results/report";

const bodySchema = z.union([
  z.object({ attemptIds: z.array(z.string().min(1)).min(1).max(1000) }),
  z.object({ examId: z.string().min(1) }),
]);

export const POST = route(async (request: Request) => {
  const actor = await requireActor("results:read");
  const body = await readJson(request, bodySchema);
  return Response.json("examId" in body ? await releaseAllForExam(actor, body.examId) : await releaseResults(actor, body.attemptIds));
});
