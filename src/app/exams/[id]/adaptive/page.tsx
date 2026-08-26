"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Question = { questionId: string; type: string; prompt: string; options: string[]; points: number };
type Result = { score: number; maxScore: number; pct: number; passed: boolean; ability: number };

export default function AdaptiveTakePage() {
  const params = useParams<{ id: string }>();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [answered, setAnswered] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/adaptive/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: params.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Unable to start."); return; }
      setAttemptId(data.attempt.id);
      const next = await fetch(`/api/adaptive/${data.attempt.id}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: "", response: null }),
      });
      const nextData = await next.json();
      if (nextData.done) { setResult({ score: 0, maxScore: 0, pct: 0, passed: false, ability: 0 }); return; }
      setQuestion(nextData.question);
      setRemaining(nextData.remaining);
    })();
  }, [params.id]);

  async function submitAnswer() {
    if (!attemptId || !question || !selected) return;
    setPending(true);
    setError("");
    const res = await fetch(`/api/adaptive/${attemptId}/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.questionId, response: selected }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) { setError(data.error ?? "Unable to continue."); return; }
    if (data.done) {
      const finish = await fetch(`/api/adaptive/${attemptId}/finish`, { method: "POST" });
      const finishData = await finish.json();
      setResult(finishData.result);
      return;
    }
    setQuestion(data.question);
    setAnswered(data.answered);
    setRemaining(data.remaining);
    setSelected("");
  }

  if (result) {
    return (
      <main className="auth-page">
        <section className="auth-card result-card">
          <p className="eyebrow auth-eyebrow">ADAPTIVE ASSESSMENT COMPLETE</p>
          <h1>{result.passed ? "Well done." : "Keep practicing."}</h1>
          <div className="result-score"><strong>{result.pct}<span>%</span></strong><p>{result.score} of {result.maxScore} points</p></div>
          <p className="result-copy">Your estimated ability level: {result.ability.toFixed(1)}. {result.passed ? "You met the pass mark." : "Review the material and try again."}</p>
          <a className="primary-button auth-submit" href="/">Back to overview<span>-&gt;</span></a>
        </section>
      </main>
    );
  }

  return (
    <main className="take-page">
      <header className="take-topbar"><a className="back-link" href="/">&lt;- Exit</a><strong>Adaptive assessment</strong><span>{answered} answered · {remaining} remaining</span></header>
      {error && <p className="take-error" role="alert">{error}</p>}
      {!attemptId && !error && <p className="take-loading">Preparing your adaptive assessment...</p>}
      {attemptId && question && (
        <section className="take-body">
          <article className="take-question">
            <div className="take-q-head"><span className="take-index">Adaptive</span><span className="take-points">{question.points} pt</span></div>
            <h2>{question.prompt}</h2>
            <div className="take-options">
              {question.options.map((option) => (
                <label className="take-option" key={option}>
                  <input type="radio" name="answer" value={option} checked={selected === option} onChange={() => setSelected(option)} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </article>
          <button className="primary-button take-submit" onClick={submitAnswer} disabled={pending || !selected}>
            {pending ? "Submitting..." : "Submit answer"}<span>-&gt;</span>
          </button>
        </section>
      )}
    </main>
  );
}
