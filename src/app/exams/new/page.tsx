"use client";

import { FormEvent, useEffect, useState } from "react";

type Course = { id: string; code: string; title: string };

export default function NewExamPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/courses");
      const data = await res.json();
      if (res.ok) setCourses(data.courses ?? []);
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; // capture before await (currentTarget is nulled after)
    setPending(true);
    setMessage("");
    const formData = new FormData(form);
    const result = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"), description: formData.get("description"),
        timeLimitMin: Number(formData.get("timeLimitMin")), passMarkPct: Number(formData.get("passMarkPct")), maxAttempts: Number(formData.get("maxAttempts")),
        shuffleQuestions: formData.get("shuffleQuestions") === "on", shuffleOptions: formData.get("shuffleOptions") === "on", adaptive: formData.get("adaptive") === "on",
        courseId: formData.get("courseId") || undefined,
      }),
    });
    setPending(false);
    const data = await result.json().catch(() => null);
    setMessage(data?.error ?? "Exam draft created.");
    if (result.ok) form.reset();
  }

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">ASSESSMENT STUDIO</p><h1>Create an exam</h1><p>Set the rules first, then add questions from your bank.</p></div>
      </div>
      <section className="authoring-layout">
        <form className="question-form" onSubmit={submit}>
          <div className="form-heading">
            <div><p className="eyebrow">EXAM DETAILS</p><h2>Untitled assessment</h2></div>
            <span className="draft-label">DRAFT</span>
          </div>
          <label>Exam title<input name="title" required minLength={3} placeholder="e.g. Mathematics: Core Concepts" /></label>
          <label>Description <span className="field-hint">Optional</span><textarea name="description" placeholder="What will this assessment measure?" /></label>
          <label>Course <span className="field-hint">Assign this exam to a course</span>
            <select name="courseId" defaultValue="">
              <option value="">No course</option>
              {courses.map((c) => <option value={c.id} key={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>Time limit (minutes)<input name="timeLimitMin" type="number" min="1" max="480" defaultValue="30" /></label>
            <label>Pass mark (%)<input name="passMarkPct" type="number" min="1" max="100" defaultValue="50" /></label>
            <label>Attempts<input name="maxAttempts" type="number" min="1" max="20" defaultValue="1" /></label>
          </div>
          <div className="settings-list">
            <label className="check-label"><input name="shuffleQuestions" type="checkbox" defaultChecked /> Shuffle questions</label>
            <label className="check-label"><input name="shuffleOptions" type="checkbox" /> Shuffle answer options</label>
            <label className="check-label"><input name="adaptive" type="checkbox" /> Enable adaptive mode later</label>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button save-question" disabled={pending}>{pending ? "Creating..." : "Create draft"}<span>-&gt;</span></button>
        </form>
        <aside className="authoring-aside">
          <div className="aside-symbol">E</div>
          <h2>Turn your question bank into a clear challenge.</h2>
          <p>Drafts stay private. Add questions, preview the candidate experience, then publish when every detail is ready.</p>
        </aside>
      </section>
    </main>
  );
}
