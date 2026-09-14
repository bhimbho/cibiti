"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Settings } from "lucide-react";

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
        <section className="data-table">
          <div className="data-row data-head"><span>Course</span><span>Code</span><span>Department</span><span>Credits</span><span>Members</span><span>Exams</span><span></span></div>
          {courses.map((course) => (
            <div className="data-row" key={course.id}>
              <strong className="data-title">{course.title}</strong>
              <span>{course.code}</span>
              <span>{course.department?.name ?? "—"}</span>
              <span>{course.credits}</span>
              <span>{course._count.enrollments}</span>
              <span>{course._count.exams}</span>
              <span className="table-actions">
                <IconButton icon={Settings} label="Manage course" href={`/courses/${course.id}`} />
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
