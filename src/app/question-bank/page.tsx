"use client";

import { FormEvent, useState } from "react";

const questionTypes = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"];

export default function QuestionBankPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        prompt: form.get("prompt"),
        options: String(form.get("options") ?? "").split("\n").filter(Boolean),
        answer: form.get("answer"),
        difficulty: form.get("difficulty"),
        points: Number(form.get("points")),
      }),
    });
    setPending(false);
    setMessage(result.ok ? "Question saved to the bank." : "Unable to save question. Sign in as an instructor first.");
    if (result.ok) event.currentTarget.reset();
  }

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">CONTENT STUDIO</p><h1>Question bank</h1><p>Build a reliable library of questions for future assessments.</p></div><div className="bank-count"><strong>0</strong><span>questions ready</span></div></div>
      <section className="authoring-layout">
        <form className="question-form" onSubmit={createQuestion}><div className="form-heading"><div><p className="eyebrow">NEW QUESTION</p><h2>Add to your bank</h2></div><span className="draft-label">DRAFT</span></div><label>Question type<select name="type" defaultValue={questionTypes[0]}>{questionTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label>Prompt<textarea name="prompt" required minLength={10} placeholder="Write the question students should answer..." /></label><label>Answer options<span className="field-hint">One option per line</span><textarea name="options" required placeholder={"The first option\nThe second option\nThe third option"} /></label><div className="form-row"><label>Correct answer<input name="answer" required placeholder="Exact answer" /></label><label>Difficulty<select name="difficulty" defaultValue="MEDIUM"><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label>Points<input name="points" type="number" min="1" max="100" defaultValue="1" /></label></div>{message && <p className="form-message" role="status">{message}</p>}<button className="primary-button save-question" disabled={pending}>{pending ? "Saving..." : "Save question"}<span>-&gt;</span></button></form>
        <aside className="authoring-aside"><div className="aside-symbol">?</div><h2>Good questions make good assessments.</h2><p>Tag questions by topic and calibrate difficulty as students answer them. That data will power smarter exams over time.</p><div className="aside-line"><span>Coming next</span><strong>Topics &amp; tags</strong></div><div className="aside-line"><span>Coming next</span><strong>Bulk import</strong></div></aside>
      </section>
    </main>
  );
}
