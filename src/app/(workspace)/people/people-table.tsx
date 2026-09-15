"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Facet } from "@/components/data-table/data-table";
import { callApi } from "@/components/exam-builder/api";
import { peopleTableConfig, roleLabels, type PersonRow } from "@/lib/people-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<PersonRow>();
const dateFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const columns = [
  column.accessor("name", {
    id: "name",
    header: "Name",
    enableHiding: false,
    meta: { label: "Name" },
    cell: ({ row }) => (
      <div className="dt-primary">
        <Link className="dt-link" href={`/people/${row.original.id}`}>{row.original.name}</Link>
        <small>{row.original.email ?? "No email"}</small>
      </div>
    ),
  }),
  column.accessor("regNumber", { id: "regNumber", header: "Matric no.", meta: { label: "Matric number" }, cell: ({ getValue }) => getValue() ?? "—" }),
  column.accessor("roles", {
    id: "roles",
    header: "Roles",
    enableSorting: false,
    meta: { label: "Roles", csv: (row) => row.roles.map((r) => roleLabels[r]).join("; ") },
    cell: ({ getValue }) => (
      <span className="role-pills">
        {getValue().map((r) => <span key={r} className={`role-pill r-${r.toLowerCase()}`}>{roleLabels[r]}</span>)}
      </span>
    ),
  }),
  column.accessor("department", { id: "department", header: "Dept", enableSorting: false, meta: { label: "Department" }, cell: ({ getValue }) => getValue() ?? "—" }),
  column.accessor("level", { id: "level", header: "Level", enableSorting: false, meta: { label: "Level" }, cell: ({ getValue }) => getValue() ?? "—" }),
  column.accessor("courses", { id: "courses", header: "Courses", enableSorting: false, meta: { label: "Courses", align: "right" } }),
  column.accessor("attempts", { id: "attempts", header: "Attempts", enableSorting: false, meta: { label: "Attempts", align: "right" } }),
  column.accessor("active", {
    id: "active",
    header: "Status",
    enableSorting: false,
    meta: { label: "Status", csv: (row) => (row.active ? "active" : "deactivated") },
    cell: ({ getValue }) => <span className={`status-pill ${getValue() ? "e-published" : "e-closed"}`}>{getValue() ? "Active" : "Deactivated"}</span>,
  }),
  column.accessor("createdAt", { id: "createdAt", header: "Added", meta: { label: "Added" }, cell: ({ getValue }) => dateFormat.format(new Date(getValue())) }),
];

export function PeopleTable({ rows, total, params, facets }: { rows: PersonRow[]; total: number; params: TableParams; facets: Facet[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function setActive(selected: PersonRow[], active: boolean, clear: () => void) {
    if (!active && !window.confirm(`Deactivate ${selected.length} account${selected.length === 1 ? "" : "s"}? They will not be able to sign in.`)) return;
    const result = await callApi<{ updated: number; skipped: number }>("/api/people/status", "POST", { ids: selected.map((p) => p.id), active });
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: `${result.data.updated} account${result.data.updated === 1 ? "" : "s"} ${active ? "activated" : "deactivated"}${result.data.skipped ? ` (${result.data.skipped} skipped)` : ""}.` });
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
        config={peopleTableConfig}
        basePath="/people"
        getRowId={(row) => row.id}
        storageKey="people"
        defaultHidden={["createdAt", "attempts"]}
        searchPlaceholder="Search name, email or matric number"
        emptyMessage="No people yet."
        exportName="people"
        facets={facets}
        bulkActions={(selected, clear) => (
          <>
            <button type="button" className="secondary-button" onClick={() => setActive(selected, true, clear)}>Activate</button>
            <button type="button" className="outline-button" onClick={() => setActive(selected, false, clear)}>Deactivate</button>
          </>
        )}
      />
    </>
  );
}
