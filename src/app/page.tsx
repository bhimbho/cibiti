"use client";

import { useEffect, useState } from "react";

type Exam = { id: string; title: string; questionCount: number; timeLimitMin: number | null };
type Attempt = { id: string; title: string; score: number | null; maxScore: number | null; submittedAt: string | null };
type Dashboard = { role: string; name: string | null; exams: Exam[]; recentAttempts: Attempt[]; completedCount: number; avgScore: number | null };

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (res.ok) setData(json);
      setLoading(false);
    })();
  }, []);

  const isStudent = data?.role === "STUDENT";
  const avgPct = data?.avgScore != null && data?.recentAttempts[0]?.maxScore ? Math.round((data.avgScore / data.recentAttempts[0].maxScore) * 100) : 0;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Cibiti</span></div>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="/"><span className="nav-icon">+</span>Overview</a>
          <a className="nav-item" href="/exams"><span className="nav-icon">[]</span>My exams</a>
          <a className="nav-item" href="/results"><span className="nav-icon">/</span>Results</a>
          {!isStudent && <a className="nav-item" href="/question-bank"><span className="nav-icon">*</span>Question bank</a>}
          {!isStudent && <a className="nav-item" href="/exams/new"><span className="nav-icon">E</span>Create exam</a>}
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/sign-in"><span className="nav-icon">?</span>Sign in</a>
          <div className="profile"><div className="avatar">{(data?.name ?? "U").slice(0, 2).toUpperCase()}</div><div><strong>{data?.name ?? "Guest"}</strong><span>{isStudent ? "Student account" : "Instructor account"}</span></div><span className="more">...</span></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><button className="icon-button" aria-label="Notifications">!!</button><div className="mini-avatar">{(data?.name ?? "U").slice(0, 2).toUpperCase()}</div></div></header>
        <section className="intro"><div><p className="eyebrow">Wednesday, August 26, 2026</p><h1>Good afternoon, {data?.name?.split(" ")[0] ?? "there"}.</h1><p className="intro-copy">{loading ? "Loading your workspace..." : isStudent ? "Keep your momentum going. Your assessments are ready when you are." : "Build assessments and track how your students perform."}</p></div><a className="primary-button" href="/exams">View my exams <span>-&gt;</span></a></section>

        <section className="stats-grid" aria-label="Progress summary">
          <article className="stat-card"><div className="stat-label">ASSESSMENTS COMPLETED</div><strong>{data?.completedCount ?? "—"}</strong><span className="trend positive">Across all subjects</span></article>
          <article className="stat-card"><div className="stat-label">AVERAGE SCORE</div><strong>{avgPct || "—"}<span className="unit">%</span></strong><span className="trend positive">Latest attempt</span></article>
          <article className="stat-card highlight"><div className="stat-label">AVAILABLE EXAMS</div><strong>{data?.exams.length ?? "—"}</strong><span className="trend neutral">Ready to take</span></article>
        </section>

        <section className="content-grid">
          <div className="panel upcoming-panel" id="exams"><div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Available assessments</h2></div><a href="/exams">See all <span>-&gt;</span></a></div>
            {data?.exams.length === 0 && <p className="take-loading">No assessments available yet.</p>}
            {data?.exams.map((exam) => (
              <div className="exam-row" key={exam.id}><div className="subject-icon blue">E</div><div className="exam-details"><h3>{exam.title}</h3><p>{exam.questionCount} questions <span>•</span> {exam.timeLimitMin ? `${exam.timeLimitMin} minutes` : "Untimed"}</p></div><a className="secondary-button" href={`/exams/${exam.id}/take`}>Begin</a></div>
            ))}
          </div>
          <div className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR JOURNEY</p><h2>Recent activity</h2></div><a href="/results">View results <span>-&gt;</span></a></div>
            {data?.recentAttempts.length === 0 && <p className="take-loading">No activity yet.</p>}
            {data?.recentAttempts.map((attempt) => {
              const pct = attempt.maxScore ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100) : 0;
              return <div className="activity-item" key={attempt.id}><div className="activity-dot done">+</div><div><h3>{attempt.title}</h3><p>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString() : "In progress"}</p></div><strong>{pct}%</strong></div>;
            })}
          </div>
        </section>

        <section className="focus-banner"><div className="focus-symbol">//</div><div><p className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</p><h2>Ready for a quick practice round?</h2><p>Sharpen a topic in five questions and keep your streak alive.</p></div><a href="/exams" className="text-button">Practice now <span>-&gt;</span></a></section>
      </main>
    </div>
  );
}
