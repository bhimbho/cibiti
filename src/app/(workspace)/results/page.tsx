import type { Metadata } from "next";
import Link from "next/link";
import { resultsTableConfig } from "@/lib/results-table";
import { parseTableParams } from "@/lib/table-params";
import { canAnywhere } from "@/server/authz";
import { candidateOverview } from "@/server/candidate";
import { requirePageActor } from "@/server/page-auth";
import { listResults } from "@/server/results/list";
import { ResultsTable } from "./results-table";

export const metadata: Metadata = { title: "Results | Cibiti" };

const dateTime = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor();

  if (!canAnywhere(actor, "results:read")) {
    const { history } = await candidateOverview(actor);
    return (
      <main className="authoring-page">
        <div className="authoring-header">
          <div>
            <p className="eyebrow">PERFORMANCE</p>
            <h1>My results</h1>
            <p>Results appear here once your institution releases them.</p>
          </div>
        </div>
        <section className="panel results-list">
          {history.length === 0 && <p className="take-loading">You have not submitted any exams yet.</p>}
          {history.map((h) => (
            <div className="activity-item" key={h.id}>
              <div className={`activity-dot ${h.passed === false ? "review" : "done"}`}>{h.percent === null ? "…" : h.passed === false ? "!" : "✓"}</div>
              <div>
                <h3>{h.examTitle}</h3>
                <p>Submitted {h.submittedAt ? dateTime.format(new Date(h.submittedAt)) : "—"}</p>
              </div>
              {h.percent === null ? (
                <strong className="muted-score">Not released</strong>
              ) : (
                <Link className="secondary-button" href={`/results/${h.id}`}>{Math.round(h.percent)}% · View</Link>
              )}
            </div>
          ))}
        </section>
      </main>
    );
  }

  const params = parseTableParams(await searchParams, resultsTableConfig);
  const { rows, total, facets } = await listResults(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">PERFORMANCE</p>
          <h1>Results</h1>
          <p>Every attempt across your organisation. Select graded attempts to release their results to candidates.</p>
        </div>
      </div>
      <ResultsTable
        rows={rows}
        total={total}
        params={params}
        canRelease={canAnywhere(actor, "grade:write") || canAnywhere(actor, "exam:publish")}
        facets={[
          { id: "exam", label: "Exam", options: facets.exam },
          { id: "status", label: "Status", options: facets.status },
          { id: "outcome", label: "Outcome", options: facets.outcome },
          { id: "released", label: "Released", options: facets.released },
        ]}
      />
    </main>
  );
}
