"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ReviewItem = { questionId: string; prompt: string; options: string[]; points: number; response: unknown; isCorrect: boolean; pointsEarned: number };
type Attempt = { id: string; title: string; score: number | null; maxScore: number | null; passMarkPct: number; submittedAt: string | null };

export default function AttemptReviewPage() {
  const params = useParams<{ id: string }>();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/attempts/${params.id}`);
      const data = await res.json();
      if (res.ok) { setAttempt(data.attempt); setReview(data.review); }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <main className="authoring-page"><p className="take-loading">Loading review...</p></main>;
  if (!attempt) return <main className="authoring-page"><p className="take-loading">Attempt not found.</p></main>;

  const pct = attempt.maxScore ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100) : 0;
  const passed = pct >= attempt.passMarkPct;

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/results">&lt;- Back to results</a><p className="eyebrow">REVIEW</p><h1>{attempt.title}</h1><p>Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}</p></div><div className="review-score"><strong className={passed ? "score-pass" : "score-fail"}>{pct}%</strong><span>{attempt.score} / {attempt.maxScore} points</span></div></div>
      <section className="review-list">
        {review.map((item, index) => (
          <article className={`review-item ${item.isCorrect ? "correct" : "incorrect"}`} key={item.questionId}>
            <div className="review-head"><span className="take-index">Q{index + 1}</span><span className="review-result">{item.isCorrect ? "Correct" : "Incorrect"}</span><span className="review-points">{item.pointsEarned} / {item.points} pts</span></div>
            <h2>{item.prompt}</h2>
            <div className="review-options">
              {item.options.map((option) => {
                const isResponse = String(item.response) === option;
                return <div className={`review-option ${isResponse ? (item.isCorrect ? "chosen-correct" : "chosen-wrong") : ""}`} key={option}><span>{isResponse ? "Your answer" : ""}</span>{option}</div>;
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
