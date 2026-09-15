"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Filter, Rows3, Search, X } from "lucide-react";
import { useLocalStorage } from "@/lib/use-local-storage";
import { pageCount, PAGE_SIZES, tableParamsToSearch, type TableConfig, type TableParams } from "@/lib/table-params";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Name shown in the column menu and CSV header. */
    label?: string;
    /** Plain-text value for CSV export when the cell renders markup. */
    csv?: (row: TData) => string | number | null;
    align?: "left" | "right";
  }
}

export type Facet = { id: string; label: string; options: { value: string; label: string }[] };

type DataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  total: number;
  params: TableParams;
  config: TableConfig;
  basePath: string;
  getRowId: (row: T) => string;
  facets?: Facet[];
  searchPlaceholder?: string;
  storageKey: string;
  defaultHidden?: string[];
  emptyMessage: string;
  exportName?: string;
  bulkActions?: (selected: T[], clearSelection: () => void) => ReactNode;
};

function applyUpdater<S>(updater: Updater<S>, current: S): S {
  return typeof updater === "function" ? (updater as (old: S) => S)(current) : updater;
}

export function DataTable<T>({
  columns,
  data,
  total,
  params,
  config,
  basePath,
  getRowId,
  facets = [],
  searchPlaceholder = "Search",
  storageKey,
  defaultHidden = [],
  emptyMessage,
  exportName = "export",
  bulkActions,
}: DataTableProps<T>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Filters and sort update instantly while the server renders the new page (slow LANs).
  const [view, setOptimisticView] = useOptimistic(params);
  const [search, setSearch] = useState(params.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const defaultVisibility = useMemo(() => Object.fromEntries(defaultHidden.map((id) => [id, false])), [defaultHidden]);
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(`${storageKey}:columns`, defaultVisibility);
  const [density, setDensity] = useLocalStorage<"comfortable" | "compact">(`${storageKey}:density`, "comfortable");

  const navigate = (next: TableParams) => {
    setRowSelection({});
    startTransition(() => {
      setOptimisticView(next);
      router.replace(`${basePath}${tableParamsToSearch(next, config)}`, { scroll: false });
    });
  };

  const sorting: SortingState = view.sort ? [{ id: view.sort.id, desc: view.sort.desc }] : [];

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!bulkActions) return columns;
    const select: ColumnDef<T, unknown> = {
      id: "_select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    };
    return [select, ...columns];
  }, [bulkActions, columns]);

  // TanStack Table returns non-memoisable functions; the React Compiler lint knows to skip it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total,
    enableRowSelection: Boolean(bulkActions),
    state: { sorting, rowSelection, columnVisibility, pagination: { pageIndex: view.page - 1, pageSize: view.pageSize } },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: (updater) => setColumnVisibility(applyUpdater(updater, columnVisibility)),
    onSortingChange: (updater) => {
      const next = applyUpdater(updater, sorting)[0];
      navigate({ ...view, page: 1, sort: next ? { id: next.id, desc: next.desc } : config.defaultSort });
    },
  });

  const pages = pageCount(total, params.pageSize);
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const activeFilters = Object.values(view.filters).reduce((n, values) => n + values.length, 0);
  const firstRow = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const lastRow = Math.min(params.page * params.pageSize, total);

  function onSearchChange(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ ...view, q: value.trim(), page: 1 }), 350);
  }

  function toggleFacet(facetId: string, value: string) {
    const current = view.filters[facetId] ?? [];
    const nextValues = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const filters = { ...view.filters, [facetId]: nextValues };
    if (!nextValues.length) delete filters[facetId];
    navigate({ ...view, filters, page: 1 });
  }

  function exportCsv() {
    const visible = table.getVisibleLeafColumns().filter((c) => c.id !== "_select");
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = visible.map((c) => escape(c.columnDef.meta?.label ?? c.id));
    const lines = table.getRowModel().rows.map((row) =>
      visible.map((c) => escape(c.columnDef.meta?.csv ? c.columnDef.meta.csv(row.original) : row.getValue(c.id))).join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${exportName}-page-${params.page}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className={`dt ${density}`} aria-busy={pending}>
      <div className="dt-toolbar">
        <label className="dt-search">
          <Search size={15} aria-hidden="true" />
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>
              <X size={14} />
            </button>
          )}
        </label>

        {facets.map((facet) => {
          const chosen = view.filters[facet.id] ?? [];
          return (
            <details className="dt-menu" key={facet.id}>
              <summary className={chosen.length ? "active" : ""}>
                <Filter size={13} /> {facet.label}
                {chosen.length > 0 && <span className="dt-count">{chosen.length}</span>}
              </summary>
              <div className="dt-menu-panel">
                {facet.options.length === 0 && <p className="dt-menu-empty">No options</p>}
                {facet.options.map((option) => (
                  <label key={option.value} className="dt-menu-option">
                    <input type="checkbox" checked={chosen.includes(option.value)} onChange={() => toggleFacet(facet.id, option.value)} />
                    {option.label}
                  </label>
                ))}
              </div>
            </details>
          );
        })}

        {(activeFilters > 0 || view.q) && (
          <button
            type="button"
            className="dt-clear"
            onClick={() => {
              clearTimeout(searchTimer.current);
              setSearch("");
              navigate({ ...view, q: "", filters: {}, page: 1 });
            }}
          >
            Clear all
          </button>
        )}

        <div className="dt-toolbar-end">
          <details className="dt-menu align-right">
            <summary aria-label="Choose columns"><Columns3 size={14} /> Columns</summary>
            <div className="dt-menu-panel">
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <label key={column.id} className="dt-menu-option">
                    <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />
                    {column.columnDef.meta?.label ?? column.id}
                  </label>
                ))}
            </div>
          </details>
          <button type="button" className="dt-tool" onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")} aria-pressed={density === "compact"}>
            <Rows3 size={14} /> {density === "compact" ? "Compact" : "Comfortable"}
          </button>
          <button type="button" className="dt-tool" onClick={exportCsv} disabled={data.length === 0}>
            <Download size={14} /> Export page
          </button>
        </div>
      </div>

      {bulkActions && selected.length > 0 && (
        <div className="dt-bulk" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          {bulkActions(selected, () => setRowSelection({}))}
          <button type="button" className="dt-clear" onClick={() => setRowSelection({})}>Clear selection</button>
        </div>
      )}

      <div className="dt-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort() && config.sortable.includes(header.column.id);
                  const direction = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align;
                  return (
                    <th key={header.id} className={`${header.column.id === "_select" ? "dt-select" : ""} ${align === "right" ? "right" : ""}`} aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>
                      {header.isPlaceholder ? null : sortable ? (
                        <button type="button" className="dt-sort" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {direction === "asc" ? <ArrowUp size={12} /> : direction === "desc" ? <ArrowDown size={12} /> : <ArrowUpDown size={12} className="dt-sort-idle" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="dt-empty" colSpan={table.getVisibleLeafColumns().length}>{params.q || Object.keys(params.filters).length ? "No results match these filters." : emptyMessage}</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={row.getIsSelected() ? "selected" : ""}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`${cell.column.id === "_select" ? "dt-select" : ""} ${cell.column.columnDef.meta?.align === "right" ? "right" : ""}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="dt-footer">
        <span>{total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total}`}</span>
        <label className="dt-page-size">
          Rows per page
          <select value={view.pageSize} onChange={(e) => navigate({ ...view, pageSize: Number(e.target.value), page: 1 })}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="dt-pager">
          <button type="button" aria-label="Previous page" disabled={view.page <= 1} onClick={() => navigate({ ...view, page: view.page - 1 })}>
            <ChevronLeft size={15} />
          </button>
          <span>Page {Math.min(view.page, pages)} of {pages}</span>
          <button type="button" aria-label="Next page" disabled={view.page >= pages} onClick={() => navigate({ ...view, page: view.page + 1 })}>
            <ChevronRight size={15} />
          </button>
        </div>
      </footer>
    </section>
  );
}
