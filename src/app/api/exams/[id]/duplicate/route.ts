import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { duplicateExam } from "@/server/exams/mutate";

export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  return Response.json({ exam: await duplicateExam(actor, (await params).id) }, { status: 201 });
});
