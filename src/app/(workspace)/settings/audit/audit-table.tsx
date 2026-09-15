"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Facet } from "@/components/data-table/data-table";
import { auditTableConfig, type AuditRow } from "@/lib/audit-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<AuditRow>();
const dateTime = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

const columns = [
  column.accessor("createdAt", { id: "createdAt", header: "When", enableHiding: false, meta: { label: "When" }, cell: ({ getValue }) => dateTime.format(new Date(getValue())) }),
  column.accessor("actor", { id: "actor", header: "Who", enableSorting: false, meta: { label: "Who" }, cell: ({ getValue }) => getValue() ?? "System" }),
  column.accessor("action", { id: "action", header: "Action", enableSorting: false, meta: { label: "Action" }, cell: ({ getValue }) => <code className="audit-code">{getValue()}</code> }),
  column.accessor("entityType", {
    id: "entityType",
    header: "Record",
    enableSorting: false,
    meta: { label: "Record" },
    cell: ({ row }) => (
      <div className="dt-primary">
        <span>{row.original.entityType}</span>
        <small>{row.original.entityId}</small>
      </div>
    ),
  }),
  column.accessor("before", { id: "before", header: "Before", enableSorting: false, meta: { label: "Before" }, cell: ({ getValue }) => <code className="audit-json">{getValue() ?? "—"}</code> }),
  column.accessor("after", { id: "after", header: "After", enableSorting: false, meta: { label: "After" }, cell: ({ getValue }) => <code className="audit-json">{getValue() ?? "—"}</code> }),
  column.accessor("ipAddress", { id: "ipAddress", header: "IP", enableSorting: false, meta: { label: "IP address" }, cell: ({ getValue }) => getValue() ?? "—" }),
];

export function AuditTable({ rows, total, params, facets }: { rows: AuditRow[]; total: number; params: TableParams; facets: Facet[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={auditTableConfig}
      basePath="/settings/audit"
      getRowId={(row) => row.id}
      storageKey="audit"
      defaultHidden={["ipAddress"]}
      searchPlaceholder="Search action or record id"
      emptyMessage="Nothing has been recorded yet."
      exportName="audit-log"
      facets={facets}
    />
  );
}
