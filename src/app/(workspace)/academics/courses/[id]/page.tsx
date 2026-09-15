import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseForm } from "@/components/academics/course-form";
import { EnrollmentManager } from "@/components/academics/enrollment-manager";
import { prisma } from "@/lib/prisma";
import { examStatusLabel } from "@/lib/exam-table";
import { getCourseDetail } from "@/server/academics/courses";
import { requirePagePermission } from "@/server/page-auth";
import { DeleteCourseButton } from "./delete-course-button";

export const metadata: Metadata = { title: "Course | Cibiti" };

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("academics:manage");
  const { id } = await params;
  const [course, departments, levels] = await Promise.all([
    getCourseDetail(actor, id),
    prisma.department.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.level.findMany({ where: { orgId: actor.orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!course) notFound();

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/academics/courses">&lt;- Back to courses</Link>
          <p className="eyebrow">COURSE · {course.department ?? "NO DEPARTMENT"}</p>
          <h1>{course.code} · {course.title}</h1>
          <p>{course.credits} units · {course.level ?? "no level"} · {course.candidates.length} candidates · {course.exams.length} exams</p>
        </div>
        {course.exams.length === 0 && <DeleteCourseButton courseId={course.id} />}
      </div>

      <div className="builder-layout">
        <EnrollmentManager courseId={course.id} candidates={course.candidates} />
        <aside className="builder-sections">
          <CourseForm
            courseId={course.id}
            initial={{ code: course.code, title: course.title, credits: course.credits, departmentId: course.departmentId, levelId: course.levelId }}
            departments={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))}
            levels={levels.map((l) => ({ value: l.id, label: l.name }))}
            compact
          />
          <section className="panel">
            <p className="eyebrow">EXAMS</p>
            {course.exams.length === 0 && <p className="take-hint">No exams linked to this course.</p>}
            {course.exams.map((exam) => (
              <div className="aside-line" key={exam.id}>
                <span><Link className="dt-link" href={`/exams/${exam.id}`}>{exam.title}</Link></span>
                <strong>{examStatusLabel[exam.status]}</strong>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
