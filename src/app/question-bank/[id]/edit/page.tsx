"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Question = { id: string; type: string; prompt: string; data: { options?: string[]; answer?: string }; explanation: string | null; difficulty: string; points: number };

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/questions/${params.id}`);
      const data = await res.json();
      if (res.ok) setQuestion(data.question);
    })();
  }, [params.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch(`/api/questions/${params.id}`, {
      method: "PUT",
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
    setMessage(res.ok ? "Question updated." : "Unable to update question.");
  }

  if (!question) return <main className="authoring-page"><p className="take-loading">Loading question...</p></main>;

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href={`/question-bank/${question.id}`}>&lt;- Back to question</a><p className="eyebrow">CONTENT STUDIO</p><h1>Edit question</h1><p>Update the prompt, options, and answer key.</p></div></div>
      <section className="authoring-layout">
        <form className="question-form" onSubmit={submit}><div className="form-heading"><div><p className="eyebrow">EDIT QUESTION</p><h2>{question.type.replaceAll("_", " ")}</h2></div><span className="draft-label">EDIT</span></div><label>Question type<select name="type" defaultValue={question.type}><option value="MULTIPLE_CHOICE">Multiple choice</option><option value="TRUE_FALSE">True / False</option><option value="SHORT_ANSWER">Short answer</option></select></label><label>Prompt<textarea name="prompt" required minLength={10} defaultValue={question.prompt} /></label><label>Answer options<span className="field-hint">One option per line</span><textarea name="options" required defaultValue={(question.data.options ?? []).join("\n")} /></label><div className="form-row"><label>Correct answer<input name="answer" required defaultValue={question.data.answer ?? ""} /></label><label>Difficulty<select name="difficulty" defaultValue={question.difficulty}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label>Points<input name="points" type="number" min="1" max="100" defaultValue={question.points} /></label></div>{message && <p className="form-message" role="status">{message}</p>}<button className="primary-button save-question" disabled={pending}>{pending ? "Saving..." : "Save changes"}<span>-&gt;</span></button></form>
        <aside className="authoring-aside"><div className="aside-symbol">i</div><h2>Editing tips</h2><p>Keep prompts clear and unambiguous. Ensure exactly one correct answer is marked.</p><div className="aside-line"><span>Type</span><strong>{question.type.replaceAll("_", " ")}</strong></div><div className="aside-line"><span>Points</span><strong>{question.points}</strong></div></aside>
      </section>
    </main>
  );
}
