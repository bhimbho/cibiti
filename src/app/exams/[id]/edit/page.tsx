"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Exam = { id: string; title: string; description: string | null; timeLimitMin: number | null; passMarkPct: number; maxAttempts: number; shuffleQuestions: boolean; shuffleOptions: boolean; adaptive: boolean };

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/exams/${params.id}`);
      const data = await res.json();
      if (res.ok) setExam(data.exam);
    })();
  }, [params.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch(`/api/exams/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"), description: form.get("description"),
        timeLimitMin: Number(form.get("timeLimitMin")), passMarkPct: Number(form.get("passMarkPct")), maxAttempts: Number(form.get("maxAttempts")),
        shuffleQuestions: form.get("shuffleQuestions") === "on", shuffleOptions: form.get("shuffleOptions") === "on", adaptive: form.get("adaptive") === "on",
      }),
    });
    setPending(false);
    setMessage(res.ok ? "Exam updated." : "Unable to update exam.");
  }

  if (!exam) return <main className="authoring-page"><p className="take-loading">Loading exam...</p></main>;

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href={`/exams/${exam.id}`}>&lt;- Back to exam</a><p className="eyebrow">ASSESSMENT STUDIO</p><h1>Edit exam</h1><p>Update the rules and settings for this assessment.</p></div></div>
      <section className="authoring-layout">
        <form className="question-form" onSubmit={submit}><div className="form-heading"><div><p className="eyebrow">EXAM DETAILS</p><h2>{exam.title}</h2></div><span className="draft-label">EDIT</span></div><label>Exam title<input name="title" required minLength={3} defaultValue={exam.title} /></label><label>Description <span className="field-hint">Optional</span><textarea name="description" defaultValue={exam.description ?? ""} /></label><div className="form-row"><label>Time limit (minutes)<input name="timeLimitMin" type="number" min="1" max="480" defaultValue={exam.timeLimitMin ?? 30} /></label><label>Pass mark (%)<input name="passMarkPct" type="number" min="1" max="100" defaultValue={exam.passMarkPct} /></label><label>Attempts<input name="maxAttempts" type="number" min="1" max="20" defaultValue={exam.maxAttempts} /></label></div><div className="settings-list"><label className="check-label"><input name="shuffleQuestions" type="checkbox" defaultChecked={exam.shuffleQuestions} /> Shuffle questions</label><label className="check-label"><input name="shuffleOptions" type="checkbox" defaultChecked={exam.shuffleOptions} /> Shuffle answer options</label><label className="check-label"><input name="adaptive" type="checkbox" defaultChecked={exam.adaptive} /> Enable adaptive mode</label></div>{message && <p className="form-message" role="status">{message}</p>}<button className="primary-button save-question" disabled={pending}>{pending ? "Saving..." : "Save changes"}<span>-&gt;</span></button></form>
        <aside className="authoring-aside"><div className="aside-symbol">i</div><h2>Exam settings</h2><p>Changes apply to future attempts. Published exams keep their current questions.</p><div className="aside-line"><span>Status</span><strong>Manageable</strong></div></aside>
      </section>
    </main>
  );
}
