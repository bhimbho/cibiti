"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Facet } from "@/components/data-table/data-table";
import { examStatusLabel, examTableConfig, type ExamRow } from "@/lib/exam-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<ExamRow>();
const dateFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const columns = [
  column.accessor("title", {
    id: "title",
    header: "Exam",
    enableHiding: false,
    meta: { label: "Exam" },
    cell: ({ row }) => (
      <div className="dt-primary">
        <Link className="dt-link" href={`/exams/${row.original.id}`}>{row.original.title}</Link>
        <small>{row.original.course ?? "Open to all candidates"}</small>
      </div>
    ),
  }),
  column.accessor("status", {
    id: "status",
    header: "Status",
    meta: { label: "Status", csv: (row) => examStatusLabel[row.status] },
    cell: ({ getValue }) => <span className={`status-pill e-${getValue().toLowerCase()}`}>{examStatusLabel[getValue()]}</span>,
  }),
  column.accessor("questionCount", { id: "questionCount", header: "Questions", enableSorting: false, meta: { label: "Questions", align: "right" } }),
  column.accessor("timeLimitMin", {
    id: "timeLimitMin",
    header: "Time",
    enableSorting: false,
    meta: { label: "Time limit (min)", align: "right" },
    cell: ({ getValue }) => (getValue() ? `${getValue()} min` : "Untimed"),
  }),
  column.accessor("attempts", {
    id: "attempts",
    header: "Attempts",
    enableSorting: false,
    meta: { label: "Attempts", align: "right" },
    cell: ({ row }) => (
      <>
        {row.original.attempts}
        {row.original.inProgress > 0 && <span className="live-badge">{row.original.inProgress} live</span>}
      </>
    ),
  }),
  column.accessor("sittings", { id: "sittings", header: "Sittings", enableSorting: false, meta: { label: "Sittings", align: "right" } }),
  column.accessor("author", { id: "author", header: "Author", enableSorting: false, meta: { label: "Author" } }),
  column.accessor("updatedAt", { id: "updatedAt", header: "Updated", meta: { label: "Updated" }, cell: ({ getValue }) => dateFormat.format(new Date(getValue())) }),
];

export function ExamsTable({ rows, total, params, facets }: { rows: ExamRow[]; total: number; params: TableParams; facets: Facet[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={examTableConfig}
      basePath="/exams"
      getRowId={(row) => row.id}
      storageKey="exams"
      defaultHidden={["author"]}
      searchPlaceholder="Search exam titles"
      emptyMessage="No exams yet. Create your first exam."
      exportName="exams"
      facets={facets}
    />
  );
}
