import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { addSection, sectionSchema } from "@/server/exams/mutate";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("exam:write");
  const input = await readJson(request, sectionSchema);
  return Response.json({ section: await addSection(actor, (await params).id, input) }, { status: 201 });
});
