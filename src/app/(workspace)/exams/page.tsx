import type { Metadata } from "next";
import Link from "next/link";
import { examTableConfig } from "@/lib/exam-table";
import { parseTableParams } from "@/lib/table-params";
import { canAnywhere } from "@/server/authz";
import { listExams } from "@/server/exams/list";
import { requirePagePermission } from "@/server/page-auth";
import { ExamsTable } from "./exams-table";

export const metadata: Metadata = { title: "Exams | Cibiti" };

export default async function ExamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission("exam:read");
  const params = parseTableParams(await searchParams, examTableConfig);
  const { rows, total, facets } = await listExams(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">ASSESSMENTS</p>
          <h1>Exams</h1>
          <p>Build, schedule and publish exams for your candidates.</p>
        </div>
        {canAnywhere(actor, "exam:write") && <Link className="primary-button" href="/exams/new">Create exam<span>-&gt;</span></Link>}
      </div>
      <ExamsTable
        rows={rows}
        total={total}
        params={params}
        facets={[
          { id: "status", label: "Status", options: facets.status },
          { id: "course", label: "Course", options: facets.course },
        ]}
      />
    </main>
  );
}
