// Table state (page, sort, search, filters) lives in the URL so views are shareable and survive reloads.
// Shared by server pages (parsing) and client tables (serialising).

export type SortState = { id: string; desc: boolean };

export type TableParams = {
  page: number;
  pageSize: number;
  sort: SortState | null;
  q: string;
  filters: Record<string, string[]>;
};

export type TableConfig = {
  sortable: readonly string[];
  filters: readonly string[];
  defaultSort: SortState | null;
};

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseTableParams(raw: RawParams, config: TableConfig): TableParams {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  const pageSize = Number.parseInt(first(raw.pageSize) ?? "", 10);

  let sort = config.defaultSort;
  const sortRaw = first(raw.sort);
  if (sortRaw) {
    const desc = sortRaw.startsWith("-");
    const id = desc ? sortRaw.slice(1) : sortRaw;
    if (config.sortable.includes(id)) sort = { id, desc };
  }

  const filters: Record<string, string[]> = {};
  for (const key of config.filters) {
    const values = [raw[key]].flat().flatMap((v) => (v ? v.split(",") : []));
    const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, 50);
    if (clean.length) filters[key] = clean;
  }

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    sort,
    q: (first(raw.q) ?? "").trim().slice(0, 200),
    filters,
  };
}

/** Serialise params, leaving out defaults to keep URLs short. */
export function tableParamsToSearch(params: TableParams, config: TableConfig): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  for (const key of config.filters) {
    const values = params.filters[key];
    if (values?.length) search.set(key, values.join(","));
  }
  const isDefaultSort = params.sort?.id === config.defaultSort?.id && params.sort?.desc === config.defaultSort?.desc;
  if (params.sort && !isDefaultSort) search.set("sort", `${params.sort.desc ? "-" : ""}${params.sort.id}`);
  if (params.pageSize !== DEFAULT_PAGE_SIZE) search.set("pageSize", String(params.pageSize));
  if (params.page > 1) search.set("page", String(params.page));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
