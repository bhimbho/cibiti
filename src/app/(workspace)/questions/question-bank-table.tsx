"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { questionTableConfig, type QuestionFacets, type QuestionRow } from "@/lib/question-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<QuestionRow>();
const dateFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const statusLabel: Record<QuestionRow["status"], string> = { DRAFT: "Draft", IN_REVIEW: "In review", APPROVED: "Approved", RETIRED: "Retired" };
const difficultyLabel: Record<QuestionRow["difficulty"], string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

const columns = [
  column.accessor("text", {
    id: "text",
    header: "Question",
    enableSorting: false,
    enableHiding: false,
    meta: { label: "Question" },
    cell: ({ row }) => (
      <div className="dt-primary">
        <Link className="dt-link" href={`/questions/${row.original.id}`}>{row.original.text}</Link>
        <small>{[row.original.subject, row.original.topic].filter(Boolean).join(" › ") || "No subject"}</small>
      </div>
    ),
  }),
  column.accessor("typeLabel", { id: "type", header: "Type", meta: { label: "Type" } }),
  column.accessor("status", {
    id: "status",
    header: "Status",
    meta: { label: "Status", csv: (row) => statusLabel[row.status] },
    cell: ({ getValue }) => <span className={`status-pill q-${getValue().toLowerCase()}`}>{statusLabel[getValue()]}</span>,
  }),
  column.accessor("difficulty", {
    id: "difficulty",
    header: "Difficulty",
    meta: { label: "Difficulty", csv: (row) => difficultyLabel[row.difficulty] },
    cell: ({ getValue }) => <span className={`diff-${getValue().toLowerCase()}`}>{difficultyLabel[getValue()]}</span>,
  }),
  column.accessor("points", { id: "points", header: "Marks", meta: { label: "Marks", align: "right" } }),
  column.accessor("usedInExams", { id: "usedInExams", header: "Used in", enableSorting: false, meta: { label: "Used in exams", align: "right" } }),
  column.accessor("author", { id: "author", header: "Author", enableSorting: false, meta: { label: "Author" } }),
  column.accessor("updatedAt", {
    id: "updatedAt",
    header: "Updated",
    meta: { label: "Updated" },
    cell: ({ getValue }) => dateFormat.format(new Date(getValue())),
  }),
];

type Props = {
  rows: QuestionRow[];
  total: number;
  params: TableParams;
  facets: QuestionFacets;
  canReview: boolean;
  canWrite: boolean;
};

export function QuestionBankTable({ rows, total, params, facets, canReview, canWrite }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeStatus(selected: QuestionRow[], status: QuestionRow["status"], clear: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/questions/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected.map((q) => q.id), status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data.error ?? "Could not update the selected questions.", tone: "error" });
      } else {
        setMessage({ text: `${data.updated} question${data.updated === 1 ? "" : "s"} marked ${statusLabel[status].toLowerCase()}.`, tone: "ok" });
        clear();
        router.refresh();
      }
    } catch {
      setMessage({ text: "No connection to the server.", tone: "error" });
    }
    setBusy(false);
  }

  const canBulk = canReview || canWrite;

  return (
    <>
      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <DataTable
        columns={columns}
        data={rows}
        total={total}
        params={params}
        config={questionTableConfig}
        basePath="/questions"
        getRowId={(row) => row.id}
        storageKey="questions"
        defaultHidden={["author"]}
        searchPlaceholder="Search question text"
        emptyMessage="The question bank is empty."
        exportName="questions"
        facets={[
          { id: "status", label: "Status", options: facets.status },
          { id: "type", label: "Type", options: facets.type },
          { id: "difficulty", label: "Difficulty", options: facets.difficulty },
          { id: "subject", label: "Subject", options: facets.subject },
        ]}
        bulkActions={
          canBulk
            ? (selected, clear) => (
                <>
                  {canReview && (
                    <>
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => changeStatus(selected, "APPROVED", clear)}>Approve</button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => changeStatus(selected, "RETIRED", clear)}>Retire</button>
                    </>
                  )}
                  {canWrite && (
                    <>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => changeStatus(selected, "IN_REVIEW", clear)}>Send to review</button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => changeStatus(selected, "DRAFT", clear)}>Move to draft</button>
                    </>
                  )}
                </>
              )
            : undefined
        }
      />
    </>
  );
}
