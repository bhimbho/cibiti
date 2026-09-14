"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Enrollment = {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string; studentId: string | null; instructorId: string | null };
};
type Exam = { id: string; title: string; status: string };
type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  department: { name: string } | null;
  enrollments: Enrollment[];
  exams: Exam[];
};

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [enrollRole, setEnrollRole] = useState("STUDENT");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("STUDENT");

  const load = async () => {
    const res = await fetch(`/api/courses/${id}`);
    const data = await res.json();
    if (res.ok) setCourse(data.course);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const dash = await fetch("/api/dashboard");
      const dashData = await dash.json();
      if (dash.ok) setRole(dashData.role);
      await load();
    })();
  }, [id]);

  const isInstructor = role !== "STUDENT";

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const res = await fetch(`/api/courses/${id}/enrollments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: enrollRole }),
    });
    const data = await res.json().catch(() => null);
    setMessage(data?.error ?? "Enrolled successfully.");
    setEmail("");
    if (res.ok) load();
  }

  async function removeMember(enrollmentId: string) {
    await fetch(`/api/courses/${id}/enrollments`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId }) });
    load();
  }

  if (loading) return <main className="authoring-page"><p className="take-loading">Loading course...</p></main>;
  if (!course) return <main className="authoring-page"><p className="take-loading">Course not found.</p></main>;

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <a className="back-link" href="/courses">&lt;- Back to courses</a>
          <p className="eyebrow">COURSE · {course.department?.name ?? "GENERAL"}</p>
          <h1>{course.title}</h1>
          <p>{course.code} · {course.credits} credits · {course.enrollments.length} members · {course.exams.length} exams</p>
        </div>
      </div>

      {isInstructor ? (
        <section className="course-grid">
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">MEMBERS</p><h2>Students & instructors</h2></div></div>

            <form className="enroll-form" onSubmit={enroll}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@institution.edu" required />
              <select value={enrollRole} onChange={(e) => setEnrollRole(e.target.value)}>
                <option value="STUDENT">Student</option>
                <option value="INSTRUCTOR">Instructor</option>
              </select>
              <button className="outline-button" type="submit">Enroll</button>
            </form>
            {message && <p className="form-message">{message}</p>}

            <div className="member-list">
              {course.enrollments.length === 0 && <p className="take-loading">No members yet.</p>}
              {course.enrollments.map((e) => (
                <div className="member-row" key={e.id}>
                  <div className="member-avatar">{(e.user.name ?? e.user.email).slice(0, 2).toUpperCase()}</div>
                  <div className="member-details">
                    <strong>{e.user.name ?? "Unnamed"}</strong>
                    <span>{e.user.email}</span>
                  </div>
                  <span className={`status-pill ${e.role === "INSTRUCTOR" ? "graded" : "in_progress"}`}>{e.role}</span>
                  {isInstructor && (
                    <button className="danger-button" onClick={() => removeMember(e.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">EXAMS</p><h2>Assessments in this course</h2></div></div>
            {course.exams.length === 0 && <p className="take-loading">No exams attached yet. Create one and assign it to this course.</p>}
            {course.exams.map((exam) => (
              <div className="member-row" key={exam.id}>
                <div className="member-details">
                  <strong>{exam.title}</strong>
                  <span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span>
                </div>
                <a className="secondary-button" href={`/exams/${exam.id}`}>Manage</a>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="panel">
          <div className="panel-heading"><div><p className="eyebrow">AVAILABLE</p><h2>Exams in this course</h2></div></div>
          {course.exams.filter((e) => e.status === "PUBLISHED").length === 0 && <p className="take-loading">No published exams in this course yet.</p>}
          {course.exams.filter((e) => e.status === "PUBLISHED").map((exam) => (
            <div className="member-row" key={exam.id}>
              <div className="member-details"><strong>{exam.title}</strong></div>
              <a className="secondary-button" href={`/exams/${exam.id}/take`}>Take exam</a>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
