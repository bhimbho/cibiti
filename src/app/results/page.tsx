"use client";

import { useEffect, useState } from "react";

type Attempt = {
  id: string;
  score: number | null;
  maxScore: number | null;
  status: string;
  submittedAt: string | null;
  exam: { id: string; title: string; passMarkPct: number };
  user?: { id: string; name: string | null; email: string };
};

export default function ResultsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/results");
      const data = await res.json();
      if (res.ok) setAttempts(data.attempts);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">PERFORMANCE</p><h1>Results</h1><p>Review scores and progress across assessments.</p></div></div>
      {loading && <p className="take-loading">Loading results...</p>}
      {!loading && attempts.length === 0 && <p className="take-loading">No results yet. Complete an assessment to see your score here.</p>}
      {!loading && attempts.length > 0 && (
        <section className="results-table">
          <div className="results-head"><span>Assessment</span><span>Student</span><span>Score</span><span>Status</span></div>
          {attempts.map((attempt) => {
            const pct = attempt.maxScore ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100) : 0;
            const passed = pct >= attempt.exam.passMarkPct;
            return (
              <a className="results-row" href={`/attempts/${attempt.id}`} key={attempt.id}>
                <strong>{attempt.exam.title}</strong>
                <span>{attempt.user ? (attempt.user.name ?? attempt.user.email) : "You"}</span>
                <span className={passed ? "score-pass" : "score-fail"}>{attempt.score ?? "—"} / {attempt.maxScore ?? "—"} <em>({pct}%)</em></span>
                <span className={`status-pill ${attempt.status.toLowerCase()}`}>{attempt.status.replaceAll("_", " ")}</span>
              </a>
            );
          })}
        </section>
      )}
    </main>
  );
}
