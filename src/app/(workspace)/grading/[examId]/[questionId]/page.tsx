import type { Metadata } from "next";
import Link from "next/link";
import { gradingItems } from "@/server/grading/queue";
import { requirePagePermission } from "@/server/page-auth";
import { MarkingPane } from "./marking-pane";

export const metadata: Metadata = { title: "Mark answers | Cibiti" };

export default async function MarkQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string; questionId: string }>;
  searchParams: Promise<{ named?: string; all?: string }>;
}) {
  const actor = await requirePagePermission("grade:write");
  const { examId, questionId } = await params;
  const { named, all } = await searchParams;
  const items = await gradingItems(actor, examId, questionId, {
    anonymous: named !== "1",
    includeGraded: all === "1",
  });

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">GRADING</p>
          <h1>{items[0]?.questionText || "Mark answers"}</h1>
          <p>
            {items.length} answer{items.length === 1 ? "" : "s"}
            {named === "1" ? " · showing names" : " · marked anonymously"}
          </p>
        </div>
        <div className="exam-detail-actions">
          <Link className="outline-button" href={`/grading/${examId}/${questionId}?${named === "1" ? "" : "named=1"}`}>
            {named === "1" ? "Hide names" : "Show names"}
          </Link>
          <Link className="outline-button" href={`/grading/${examId}/${questionId}?all=${all === "1" ? "0" : "1"}${named === "1" ? "&named=1" : ""}`}>
            {all === "1" ? "Only unmarked" : "Include marked"}
          </Link>
          <Link className="outline-button" href="/grading">Back to queue</Link>
        </div>
      </div>

      <MarkingPane items={items} />
    </main>
  );
}
