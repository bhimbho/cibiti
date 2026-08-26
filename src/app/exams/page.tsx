"use client";

import { useEffect, useState } from "react";

type Exam = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  timeLimitMin: number | null;
  passMarkPct: number;
  maxAttempts: number;
  _count: { items: number; attempts: number };
};

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/exams");
      const data = await res.json();
      if (res.ok) setExams(data.exams);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="authoring-page">
      <div className="authoring-header"><div><a className="back-link" href="/">&lt;- Back to overview</a><p className="eyebrow">ASSESSMENTS</p><h1>My exams</h1><p>Browse published assessments or manage your drafts.</p></div><a className="primary-button" href="/exams/new">Create exam<span>-&gt;</span></a></div>
      {loading && <p className="take-loading">Loading exams...</p>}
      {!loading && exams.length === 0 && <p className="take-loading">No exams yet. Create your first assessment to get started.</p>}
      {!loading && exams.length > 0 && (
        <section className="exam-list">
          {exams.map((exam) => (
            <article className="exam-card" key={exam.id}>
              <div className="exam-card-head"><span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span><span className="exam-card-count">{exam._count.items} questions</span></div>
              <h2>{exam.title}</h2>
              <p>{exam.description ?? "No description provided."}</p>
              <div className="exam-card-meta"><span>{exam.timeLimitMin ? `${exam.timeLimitMin} min` : "Untimed"}</span><span>Pass: {exam.passMarkPct}%</span><span>{exam.maxAttempts} attempt{exam.maxAttempts > 1 ? "s" : ""}</span></div>
              <div className="exam-card-actions">
                <a className="secondary-button" href={`/exams/${exam.id}`}>Manage</a>
                {exam.status === "PUBLISHED" && <a className="secondary-button" href={`/exams/${exam.id}/take`}>Take exam</a>}
                {exam.status !== "PUBLISHED" && <span className="draft-hint">Draft</span>}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
