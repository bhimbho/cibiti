import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { defaultExamSettings, ExamSettingsForm } from "@/components/exam-builder/settings-form";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Create exam | Cibiti" };

export default async function NewExamPage() {
  const actor = await requirePagePermission("exam:write");
  const courses = await prisma.course.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true } });

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/exams">&lt;- Back to exams</Link>
          <p className="eyebrow">ASSESSMENTS</p>
          <h1>Create an exam</h1>
          <p>Set the rules first. You will add questions and sittings next.</p>
        </div>
      </div>
      <section className="single-form">
        <ExamSettingsForm initial={defaultExamSettings} courses={courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))} />
      </section>
    </main>
  );
}
