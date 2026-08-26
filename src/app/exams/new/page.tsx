"use client";

import { FormEvent, useState } from "react";

export default function NewExamPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"), description: form.get("description"),
        timeLimitMin: Number(form.get("timeLimitMin")), passMarkPct: Number(form.get("passMarkPct")), maxAttempts: Number(form.get("maxAttempts")),
        shuffleQuestions: form.get("shuffleQuestions") === "on", shuffleOptions: form.get("shuffleOptions") === "on", adaptive: form.get("adaptive") === "on",
      }),
    });
    setPending(false);
    setMessage(result.ok ? "Exam draft created." : "Unable to create exam. Sign in as an instructor first.");
    if (result.ok) event.currentTarget.reset();
  }

  return <main className="authoring-page"><div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">ASSESSMENT STUDIO</p><h1>Create an exam</h1><p>Set the rules first, then add questions from your bank.</p></div></div><section className="authoring-layout"><form className="question-form" onSubmit={submit}><div className="form-heading"><div><p className="eyebrow">EXAM DETAILS</p><h2>Untitled assessment</h2></div><span className="draft-label">DRAFT</span></div><label>Exam title<input name="title" required minLength={3} placeholder="e.g. Mathematics: Core Concepts" /></label><label>Description <span className="field-hint">Optional</span><textarea name="description" placeholder="What will this assessment measure?" /></label><div className="form-row"><label>Time limit (minutes)<input name="timeLimitMin" type="number" min="1" max="480" defaultValue="30" /></label><label>Pass mark (%)<input name="passMarkPct" type="number" min="1" max="100" defaultValue="50" /></label><label>Attempts<input name="maxAttempts" type="number" min="1" max="20" defaultValue="1" /></label></div><div className="settings-list"><label className="check-label"><input name="shuffleQuestions" type="checkbox" defaultChecked /> Shuffle questions</label><label className="check-label"><input name="shuffleOptions" type="checkbox" /> Shuffle answer options</label><label className="check-label"><input name="adaptive" type="checkbox" /> Enable adaptive mode later</label></div>{message && <p className="form-message" role="status">{message}</p>}<button className="primary-button save-question" disabled={pending}>{pending ? "Creating..." : "Create draft"}<span>-&gt;</span></button></form><aside className="authoring-aside"><div className="aside-symbol">E</div><h2>Turn your question bank into a clear challenge.</h2><p>Drafts stay private. Add questions, preview the candidate experience, then publish when every detail is ready.</p><div className="aside-line"><span>Step 1</span><strong>Set exam rules</strong></div><div className="aside-line"><span>Step 2</span><strong>Add questions</strong></div><div className="aside-line"><span>Step 3</span><strong>Preview &amp; publish</strong></div></aside></section></main>;
}
