"use client";

import { useEffect, useState } from "react";

type Student = {
  id: string;
  name: string | null;
  email: string;
  studentId: string | null;
  department: string | null;
  attempts: number;
  courses: { id: string; code: string; role: string }[];
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/students");
      const data = await res.json();
      if (res.ok) setStudents(data.students);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <a className="back-link" href="/">&lt;- Back to overview</a>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Students</h1>
          <p>View your student body, their courses, and assessment activity.</p>
        </div>
        <a className="primary-button" href="/courses">Manage courses<span>-&gt;</span></a>
      </div>

      {loading && <p className="take-loading">Loading students...</p>}
      {!loading && students.length === 0 && <p className="take-loading">No students registered yet.</p>}
      {!loading && students.length > 0 && (
        <section className="results-table">
          <div className="results-head"><span>Student</span><span>ID</span><span>Department</span><span>Courses</span><span>Attempts</span></div>
          {students.map((s) => (
            <div className="results-row" key={s.id}>
              <strong>{s.name ?? "Unnamed"}<br /><span style={{ fontWeight: 400 }}>{s.email}</span></strong>
              <span>{s.studentId ?? "—"}</span>
              <span>{s.department ?? "—"}</span>
              <span>{s.courses.length ? s.courses.map((c) => c.code).join(", ") : "—"}</span>
              <span>{s.attempts}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
