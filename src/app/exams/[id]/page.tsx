"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Question = { id: string; type: string; prompt: string; difficulty: string; points: number };
type Exam = {
  id: string; title: string; description: string | null; status: string; timeLimitMin: number | null; passMarkPct: number; adaptive: boolean;
  items: { id: string; order: number; points: number; question: Question }[];
};

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [bank, setBank] = useState<Question[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [examRes, bankRes] = await Promise.all([fetch(`/api/exams/${params.id}`), fetch("/api/questions")]);
    const examData = await examRes.json();
    const bankData = await bankRes.json();
    if (examRes.ok) setExam(examData.exam);
    if (bankRes.ok) setBank(bankData.questions);
    setLoading(false);
  }

  useEffect(() => { load(); }, [params.id]);

  async function addQuestion(questionId: string) {
    setMessage("");
    const res = await fetch(`/api/exams/${params.id}/questions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId }),
    });
    setMessage(res.ok ? "Question added to the exam." : "Unable to add question.");
    if (res.ok) load();
  }

  async function publish() {
    setMessage("");
    const res = await fetch(`/api/exams/${params.id}/publish`, { method: "POST" });
    setMessage(res.ok ? "Exam published and now available to students." : "Unable to publish. Add at least one question first.");
    if (res.ok) load();
  }

  async function remove() {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    const res = await fetch(`/api/exams/${params.id}`, { method: "DELETE" });
    if (res.ok) router.push("/exams");
  }

  if (loading) return <main className="authoring-page"><p className="take-loading">Loading exam...</p></main>;

  if (!exam) return <main className="authoring-page"><p className="take-loading">Exam not found.</p></main>;

  const addedIds = new Set(exam.items.map((item) => item.question.id));
  const available = bank.filter((q) => !addedIds.has(q.id));

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/exams">&lt;- Back to exams</a><p className="eyebrow">ASSESSMENT STUDIO</p><h1>{exam.title}</h1><p>{exam.description ?? "No description provided."}</p></div><div className="exam-detail-actions"><span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span><a className="secondary-button" href={`/exams/${exam.id}/edit`}>Edit</a>{exam.adaptive && <a className="secondary-button" href={`/exams/${exam.id}/adaptive`}>Preview adaptive</a>}{exam.status !== "PUBLISHED" && <button className="primary-button" onClick={publish}>Publish<span>-&gt;</span></button>}<button className="outline-button danger-button" onClick={remove}>Delete</button></div></div>
      {message && <p className="form-message" role="status">{message}</p>}
      <section className="authoring-layout">
        <div className="question-form">
          <div className="form-heading"><div><p className="eyebrow">EXAM CONTENT</p><h2>Questions ({exam.items.length})</h2></div><span className="exam-card-count">{exam.timeLimitMin ? `${exam.timeLimitMin} min` : "Untimed"} · Pass {exam.passMarkPct}%</span></div>
          {exam.items.length === 0 && <p className="take-loading">No questions yet. Add some from your bank below.</p>}
          {exam.items.map((item) => (
            <div className="exam-question-row" key={item.id}>
              <span className="take-index">Q{item.order + 1}</span>
              <div><strong>{item.question.prompt}</strong><p>{item.question.type.replaceAll("_", " ")} · {item.question.difficulty} · {item.points} pts</p></div>
            </div>
          ))}
        </div>
        <aside className="authoring-aside">
          <div className="aside-symbol">+</div>
          <h2>Add from your question bank</h2>
          <p>Pick questions to include in this assessment. Published exams are immediately available to students.</p>
          {available.length === 0 && <p className="take-loading">All bank questions are already in this exam.</p>}
          {available.map((q) => (
            <div className="bank-item" key={q.id}>
              <div><strong>{q.prompt}</strong><p>{q.type.replaceAll("_", " ")} · {q.difficulty}</p></div>
              <button className="outline-button" onClick={() => addQuestion(q.id)}>Add</button>
            </div>
          ))}
        </aside>
      </section>
    </main>
  );
}
