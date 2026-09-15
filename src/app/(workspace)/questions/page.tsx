import type { Metadata } from "next";
import { questionTableConfig } from "@/lib/question-table";
import { parseTableParams } from "@/lib/table-params";
import { can } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { listQuestions } from "@/server/questions/list";
import { QuestionBankTable } from "./question-bank-table";

export const metadata: Metadata = { title: "Question bank | Cibiti" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission("question:read");
  const params = parseTableParams(await searchParams, questionTableConfig);
  const { rows, total, facets } = await listQuestions(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">CONTENT</p>
          <h1>Question bank</h1>
          <p>Search, filter and review every question in your organisation.</p>
        </div>
        <div className="bank-count">
          <strong>{total}</strong>
          <span>{params.q || Object.keys(params.filters).length ? "matching questions" : "questions"}</span>
        </div>
      </div>
      <QuestionBankTable rows={rows} total={total} params={params} facets={facets} canReview={can(actor, "question:review")} canWrite={can(actor, "question:write")} />
    </main>
  );
}
