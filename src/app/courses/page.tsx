"use client";

import { useEffect, useState } from "react";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  department: { name: string } | null;
  _count: { enrollments: number; exams: number };
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("STUDENT");

  useEffect(() => {
    (async () => {
      const [courseRes, dashRes] = await Promise.all([
        fetch("/api/courses"),
        fetch("/api/dashboard"),
      ]);
      const courseData = await courseRes.json();
      const dashData = await dashRes.json();
      if (courseRes.ok) setCourses(courseData.courses);
      if (dashRes.ok) setRole(dashData.role);
      setLoading(false);
    })();
  }, []);

  const isInstructor = role !== "STUDENT";

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <a className="back-link" href="/">&lt;- Back to overview</a>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Courses</h1>
          <p>Courses group your students and exams into a single subject area.</p>
        </div>
        {isInstructor && <a className="primary-button" href="/courses/new">Create course<span>-&gt;</span></a>}
      </div>

      {loading && <p className="take-loading">Loading courses...</p>}
      {!loading && courses.length === 0 && (
        <p className="take-loading">
          {isInstructor
            ? "No courses yet. Create your first course to enrol students and attach exams."
            : "You are not enrolled in any courses yet."}
        </p>
      )}
      {!loading && courses.length > 0 && (
        <section className="exam-list">
          {courses.map((course) => (
            <a className="exam-card course-card" href={`/courses/${course.id}`} key={course.id}>
              <div className="exam-card-head">
                <span className="status-pill graded">{course.code}</span>
                <span className="exam-card-count">{course.credits} credits</span>
              </div>
              <h2>{course.title}</h2>
              <p>{course.department?.name ?? "General subject"}</p>
              <div className="exam-card-meta">
                <span>{course._count.enrollments} member{course._count.enrollments === 1 ? "" : "s"}</span>
                <span>{course._count.exams} exam{course._count.exams === 1 ? "" : "s"}</span>
              </div>
            </a>
          ))}
        </section>
      )}
    </main>
  );
}
