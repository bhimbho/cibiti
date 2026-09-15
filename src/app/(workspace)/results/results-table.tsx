"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Facet } from "@/components/data-table/data-table";
import { callApi } from "@/components/exam-builder/api";
import { attemptStatusLabel, resultsTableConfig, type ResultRow } from "@/lib/results-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<ResultRow>();
const dateTime = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const columns = [
  column.accessor("candidate", {
    id: "candidate",
    header: "Candidate",
    enableHiding: false,
    meta: { label: "Candidate" },
    cell: ({ row }) => (
      <div className="dt-primary">
        <Link className="dt-link" href={`/results/${row.original.id}`}>{row.original.candidate}</Link>
        <small>{row.original.regNumber ?? "—"}</small>
      </div>
    ),
  }),
  column.accessor("exam", { id: "exam", header: "Exam", enableSorting: false, meta: { label: "Exam" } }),
  column.accessor("status", {
    id: "status",
    header: "Status",
    enableSorting: false,
    meta: { label: "Status", csv: (row) => attemptStatusLabel[row.status] },
    cell: ({ row }) => (
      <span className={`status-pill a-${row.original.status.toLowerCase()}`}>
        {attemptStatusLabel[row.original.status]}
        {row.original.submissionType === "TIME_EXPIRED" ? " · timed out" : ""}
      </span>
    ),
  }),
  column.accessor("percent", {
    id: "percent",
    header: "Score",
    meta: { label: "Score (%)", align: "right", csv: (row) => row.percent },
    cell: ({ row }) =>
      row.original.percent === null ? (
        "—"
      ) : (
        <span className={row.original.passed === false ? "score-fail" : row.original.passed ? "score-pass" : ""}>
          {Math.round(row.original.percent)}% <em>({row.original.score}/{row.original.maxScore})</em>
        </span>
      ),
  }),
  column.accessor("released", {
    id: "released",
    header: "Released",
    enableSorting: false,
    meta: { label: "Released", csv: (row) => (row.released ? "yes" : "no") },
    cell: ({ getValue }) => (getValue() ? "Yes" : <span className="draft-hint">Not yet</span>),
  }),
  column.accessor("flags", {
    id: "flags",
    header: "Flags",
    enableSorting: false,
    meta: { label: "Integrity flags", align: "right" },
    cell: ({ getValue }) => (getValue() ? <span className="live-badge">{getValue()}</span> : "0"),
  }),
  column.accessor("durationMin", { id: "durationMin", header: "Duration", enableSorting: false, meta: { label: "Duration (min)", align: "right" }, cell: ({ getValue }) => (getValue() === null ? "—" : `${getValue()} min`) }),
  column.accessor("startedAt", { id: "startedAt", header: "Started", meta: { label: "Started" }, cell: ({ getValue }) => dateTime.format(new Date(getValue())) }),
  column.accessor("submittedAt", { id: "submittedAt", header: "Submitted", meta: { label: "Submitted" }, cell: ({ getValue }) => (getValue() ? dateTime.format(new Date(getValue()!)) : "—") }),
];

export function ResultsTable({ rows, total, params, facets, canRelease }: { rows: ResultRow[]; total: number; params: TableParams; facets: Facet[]; canRelease: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function release(selected: ResultRow[], clear: () => void) {
    const result = await callApi<{ released: number; skipped: number }>("/api/results/release", "POST", { attemptIds: selected.map((r) => r.id) });
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: `Released ${result.data.released} result${result.data.released === 1 ? "" : "s"}${result.data.skipped ? `; ${result.data.skipped} skipped (not graded or already released)` : ""}.` });
    clear();
    router.refresh();
  }

  return (
    <>
      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <DataTable
        columns={columns}
        data={rows}
        total={total}
        params={params}
        config={resultsTableConfig}
        basePath="/results"
        getRowId={(row) => row.id}
        storageKey="results"
        defaultHidden={["startedAt"]}
        searchPlaceholder="Search candidate name or matric number"
        emptyMessage="No attempts yet."
        exportName="results"
        facets={facets}
        bulkActions={canRelease ? (selected, clear) => <button type="button" className="secondary-button" onClick={() => release(selected, clear)}>Release results</button> : undefined}
      />
    </>
  );
}
