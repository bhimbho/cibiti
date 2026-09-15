import type { Metadata } from "next";
import Link from "next/link";
import { itemTypes } from "@/items/registry";
import { QuestionEditor } from "@/components/question-editor/question-editor";
import { can } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { listSubjects } from "@/server/questions/mutate";

export const metadata: Metadata = { title: "New question | Cibiti" };

export default async function NewQuestionPage() {
  const actor = await requirePagePermission("question:write");
  const subjects = await listSubjects(actor.orgId);
  const types = [...itemTypes.values()].map(({ key, label, description }) => ({ key, label, description }));

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/questions">&lt;- Back to question bank</Link>
          <p className="eyebrow">CONTENT</p>
          <h1>Add a question</h1>
          <p>Build the question on the left and try it as a candidate on the right.</p>
        </div>
      </div>
      <QuestionEditor types={types} subjects={subjects} canReview={can(actor, "question:review")} />
    </main>
  );
}
