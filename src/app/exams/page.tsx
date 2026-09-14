"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Settings, ClipboardCheck } from "lucide-react";

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
        <section className="data-table">
          <div className="data-row data-head"><span>Exam</span><span>Status</span><span>Questions</span><span>Limit</span><span>Pass</span><span>Attempts</span><span></span></div>
          {exams.map((exam) => (
            <div className="data-row" key={exam.id}>
              <strong className="data-title">{exam.title}<small>{exam.description ?? "No description provided."}</small></strong>
              <span><span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span></span>
              <span>{exam._count.items}</span>
              <span>{exam.timeLimitMin ? `${exam.timeLimitMin} min` : "Untimed"}</span>
              <span>{exam.passMarkPct}%</span>
              <span>{exam.maxAttempts}</span>
              <span className="table-actions">
                <IconButton icon={Settings} label="Manage exam" href={`/exams/${exam.id}`} />
                {exam.status === "PUBLISHED" && (
                  <IconButton icon={ClipboardCheck} label="Take exam" href={`/exams/${exam.id}/take`} />
                )}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
