"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Question = {
  id: string; type: string; prompt: string; data: { options?: string[]; answer?: string };
  explanation: string | null; difficulty: string; points: number;
};

export default function QuestionDetailPage() {
  const params = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/questions/${params.id}`);
      const data = await res.json();
      if (res.ok) setQuestion(data.question);
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <main className="authoring-page"><p className="take-loading">Loading question...</p></main>;
  if (!question) return <main className="authoring-page"><p className="take-loading">Question not found.</p></main>;

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/question-bank">&lt;- Back to question bank</a><p className="eyebrow">CONTENT STUDIO</p><h1>Question detail</h1><p>Review the question and its answer key.</p></div><span className={`status-pill ${question.difficulty.toLowerCase()}`}>{question.difficulty}</span></div>
      <section className="authoring-layout">
        <div className="question-form">
          <div className="form-heading"><div><p className="eyebrow">QUESTION</p><h2>{question.type.replaceAll("_", " ")}</h2></div><span className="exam-card-count">{question.points} pts</span></div>
          <p className="question-detail-prompt">{question.prompt}</p>
          <div className="question-options">
            {question.data.options?.map((option) => (
              <div className={`question-option ${option === question.data.answer ? "correct" : ""}`} key={option}>
                <span>{option === question.data.answer ? "✓" : "•"}</span>{option}
              </div>
            ))}
          </div>
          {question.explanation && <div className="question-explanation"><strong>Explanation</strong><p>{question.explanation}</p></div>}
        </div>
        <aside className="authoring-aside"><div className="aside-symbol">i</div><h2>Question details</h2><p>This question is part of your reusable bank. It can be added to any exam.</p><div className="aside-line"><span>Type</span><strong>{question.type.replaceAll("_", " ")}</strong></div><div className="aside-line"><span>Difficulty</span><strong>{question.difficulty}</strong></div><div className="aside-line"><span>Points</span><strong>{question.points}</strong></div></aside>
      </section>
    </main>
  );
}
