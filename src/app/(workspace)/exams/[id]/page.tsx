import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamBuilder } from "@/components/exam-builder/exam-builder";
import { can } from "@/server/authz";
import { getExamBuilder } from "@/server/exams/builder";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Exam builder | Cibiti" };

export default async function ExamBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("exam:write");
  const { id } = await params;
  const data = await getExamBuilder(actor, id);
  if (!data) notFound();

  return (
    <main className="authoring-page wide">
      <ExamBuilder data={data} canPublish={can(actor, "exam:publish", { courseId: data.settings.courseId })} />
    </main>
  );
}
