import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { closeExam, publishExam, unpublishExam } from "@/server/exams/mutate";

const bodySchema = z.object({ action: z.enum(["publish", "close", "unpublish"]) });

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:publish");
  const { id } = await params;
  const { action } = await readJson(request, bodySchema);
  const result = action === "publish" ? await publishExam(actor, id) : action === "close" ? await closeExam(actor, id) : await unpublishExam(actor, id);
  return Response.json(result);
});
