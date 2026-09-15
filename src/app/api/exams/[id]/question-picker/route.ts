import { questionTableConfig } from "@/lib/question-table";
import { parseTableParams } from "@/lib/table-params";
import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { listQuestions } from "@/server/questions/list";

// Search the bank while building an exam. Defaults to approved questions.
export const GET = route(async (request: Request) => {
  const actor = await requireActor("exam:write");
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const params = parseTableParams({ status: "APPROVED", pageSize: "25", ...raw }, questionTableConfig);
  const { rows, total } = await listQuestions(actor, params);
  return Response.json({ rows, total, page: params.page, pageSize: params.pageSize });
});
