import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemTypes } from "@/items/registry";
import { QuestionEditor } from "@/components/question-editor/question-editor";
import { can } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { getQuestionForEditing, listSubjects } from "@/server/questions/mutate";

export const metadata: Metadata = { title: "Edit question | Cibiti" };

const dateFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function EditQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const actor = await requirePagePermission("question:read");
  const { id } = await params;
  const [question, subjects] = await Promise.all([getQuestionForEditing(actor, id), listSubjects(actor.orgId)]);
  if (!question) notFound();
  const { saved } = await searchParams;
  const types = [...itemTypes.values()].map(({ key, label, description }) => ({ key, label, description }));

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/questions">&lt;- Back to question bank</Link>
          <p className="eyebrow">CONTENT · VERSION {question.versions[0]?.version ?? 1}</p>
          <h1>Edit question</h1>
          <p>
            By {question.author} · used in {question.usedInExams} exam{question.usedInExams === 1 ? "" : "s"} · answered {question.timesAnswered} time{question.timesAnswered === 1 ? "" : "s"}. Saving creates a new version; exams keep the version they were built with.
          </p>
        </div>
      </div>
      {saved && <p className="form-message" role="status">Question created.</p>}
      {can(actor, "question:write") ? (
        <QuestionEditor
          key={question.versions[0]?.version}
          questionId={question.id}
          initial={question.input}
          status={question.status}
          types={types}
          subjects={subjects}
          canReview={can(actor, "question:review")}
          lockedType={question.usedInExams > 0 || question.timesAnswered > 0}
        />
      ) : (
        <p className="take-loading">You can view questions but not edit them.</p>
      )}
      <section className="panel version-panel">
        <div className="panel-heading"><div><p className="eyebrow">HISTORY</p><h2>Versions</h2></div></div>
        {question.versions.map((v) => (
          <div className="activity-item" key={v.version}>
            <div className="activity-dot done">v{v.version}</div>
            <div><h3>Version {v.version}</h3><p>{v.author} · {dateFormat.format(new Date(v.createdAt))}</p></div>
          </div>
        ))}
      </section>
    </main>
  );
}
