import type { Metadata } from "next";
import { ExamPlayer } from "@/components/exam-player/exam-player";
import { requirePageActor } from "@/server/page-auth";

export const metadata: Metadata = { title: "Exam in progress | Cibiti" };

export default async function TakeExamPage({ params }: { params: Promise<{ examId: string }> }) {
  await requirePageActor();
  const { examId } = await params;
  return <ExamPlayer examId={examId} />;
}
