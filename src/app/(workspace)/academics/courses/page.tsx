import type { Metadata } from "next";
import { AcademicsTabs } from "@/components/academics/academics-tabs";
import { CourseForm } from "@/components/academics/course-form";
import { courseTableConfig } from "@/lib/course-table";
import { parseTableParams } from "@/lib/table-params";
import { listCourses } from "@/server/academics/courses";
import { requirePagePermission } from "@/server/page-auth";
import { CoursesTable } from "./courses-table";

export const metadata: Metadata = { title: "Courses | Cibiti" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission("academics:manage");
  const params = parseTableParams(await searchParams, courseTableConfig);
  const { rows, total, facets } = await listCourses(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Courses &amp; subjects</h1>
          <p>Candidates registered on a course can sit the exams linked to it.</p>
        </div>
      </div>
      <AcademicsTabs active="courses" />
      <div className="builder-layout">
        <CoursesTable
          rows={rows}
          total={total}
          params={params}
          facets={[
            { id: "department", label: "Department", options: facets.department },
            { id: "level", label: "Level", options: facets.level },
          ]}
        />
        <aside className="course-aside">
          <CourseForm departments={facets.department} levels={facets.level} compact />
        </aside>
      </div>
    </main>
  );
}
