"use client";

import { useEffect, useState } from "react";

type Question = { id: string; type: string; prompt: string; difficulty: string; points: number; updatedAt: string };

export default function QuestionBankListPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/questions");
      const data = await res.json();
      if (res.ok) setQuestions(data.questions);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">CONTENT STUDIO</p><h1>Question bank</h1><p>Browse, review, and manage your question library.</p></div><a className="primary-button" href="/question-bank/new">Add question<span>-&gt;</span></a></div>
      {loading && <p className="take-loading">Loading questions...</p>}
      {!loading && questions.length === 0 && <p className="take-loading">No questions yet. Add your first question to build the bank.</p>}
      {!loading && questions.length > 0 && (
        <section className="results-table">
          <div className="results-head"><span>Question</span><span>Type</span><span>Difficulty</span><span>Points</span></div>
          {questions.map((q) => (
            <a className="results-row question-link" href={`/question-bank/${q.id}`} key={q.id}>
              <strong>{q.prompt}</strong>
              <span>{q.type.replaceAll("_", " ")}</span>
              <span className={`diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
              <span>{q.points}</span>
            </a>
          ))}
        </section>
      )}
    </main>
  );
}

