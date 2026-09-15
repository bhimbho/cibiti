"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Facet } from "@/components/data-table/data-table";
import { courseTableConfig, type CourseRow } from "@/lib/course-table";
import type { TableParams } from "@/lib/table-params";

const column = createColumnHelper<CourseRow>();

const columns = [
  column.accessor("code", {
    id: "code",
    header: "Code",
    enableHiding: false,
    meta: { label: "Code" },
    cell: ({ row }) => <Link className="dt-link" href={`/academics/courses/${row.original.id}`}>{row.original.code}</Link>,
  }),
  column.accessor("title", { id: "title", header: "Title", meta: { label: "Title" } }),
  column.accessor("department", { id: "department", header: "Dept", enableSorting: false, meta: { label: "Department" }, cell: ({ getValue }) => getValue() ?? "—" }),
  column.accessor("level", { id: "level", header: "Level", enableSorting: false, meta: { label: "Level" }, cell: ({ getValue }) => getValue() ?? "—" }),
  column.accessor("credits", { id: "credits", header: "Units", enableSorting: false, meta: { label: "Units", align: "right" } }),
  column.accessor("candidates", { id: "candidates", header: "Candidates", enableSorting: false, meta: { label: "Candidates", align: "right" } }),
  column.accessor("exams", { id: "exams", header: "Exams", enableSorting: false, meta: { label: "Exams", align: "right" } }),
];

export function CoursesTable({ rows, total, params, facets }: { rows: CourseRow[]; total: number; params: TableParams; facets: Facet[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={courseTableConfig}
      basePath="/academics/courses"
      getRowId={(row) => row.id}
      storageKey="courses"
      searchPlaceholder="Search code or title"
      emptyMessage="No courses yet."
      exportName="courses"
      facets={facets}
    />
  );
}
