"use client";

import { useEffect, useState } from "react";

type Item = { id: string; prompt: string; difficulty: string; attempts: number; correct: number; pct: number | null };
type Analytics = { analytics: Item[]; totalAttempts: number; avgPct: number };

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/analytics");
      const json = await res.json();
      if (res.ok) setData(json);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">INSIGHTS</p><h1>Question analytics</h1><p>See how your questions perform across all attempts.</p></div><div className="bank-count"><strong>{data?.avgPct ?? "—"}%</strong><span>average accuracy</span></div></div>
      {loading && <p className="take-loading">Loading analytics...</p>}
      {!loading && (!data || data.analytics.length === 0) && <p className="take-loading">No question data yet. Analytics appear once students answer your questions.</p>}
      {!loading && data && data.analytics.length > 0 && (
        <section className="results-table">
          <div className="results-head"><span>Question</span><span>Difficulty</span><span>Attempts</span><span>Accuracy</span></div>
          {data.analytics.map((item) => (
            <div className="results-row" key={item.id}>
              <strong>{item.prompt}</strong>
              <span className={`diff-${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>
              <span>{item.attempts}</span>
              <span className={item.pct != null && item.pct >= 60 ? "score-pass" : "score-fail"}>{item.pct != null ? `${item.pct}%` : "—"}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
