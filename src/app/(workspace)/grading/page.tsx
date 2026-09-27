import type { Metadata } from "next";
import Link from "next/link";
import { gradingQueue } from "@/server/grading/queue";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Marking | Cibiti" };

export default async function GradingPage() {
  const actor = await requirePagePermission("grade:write");
  const groups = await gradingQueue(actor);
  const pending = groups.reduce((sum, g) => sum + g.pending, 0);

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">GRADING</p>
          <h1>Marking queue</h1>
          <p>
            {pending === 0
              ? "Nothing is waiting to be marked."
              : `${pending} answer${pending === 1 ? "" : "s"} waiting across ${groups.length} question${groups.length === 1 ? "" : "s"}. Marking one question at a time keeps your standard consistent.`}
          </p>
        </div>
      </div>

      <section className="panel results-list">
        {groups.length === 0 && (
          <p className="take-loading">
            Answers appear here when a scorer cannot decide them — an unmatched short answer, for example.
          </p>
        )}
        {groups.map((group) => (
          <div className="activity-item" key={`${group.examId}:${group.questionId}`}>
            <div className="activity-dot review">{group.pending}</div>
            <div>
              <h3>{group.questionText || "Untitled question"}</h3>
              <p>
                {group.examTitle} · {group.typeLabel} · {group.maxPoints} mark{group.maxPoints === 1 ? "" : "s"}
              </p>
            </div>
            <Link className="secondary-button" href={`/grading/${group.examId}/${group.questionId}`}>
              Mark {group.pending}
            </Link>
          </div>
        ))}
      </section>
    </main>
  );
}
