import { describe, expect, it } from "vitest";
import { parseTableParams, tableParamsToSearch, type TableConfig } from "./table-params";

const config: TableConfig = {
  sortable: ["updatedAt", "status"],
  filters: ["status", "type"],
  defaultSort: { id: "updatedAt", desc: true },
};

describe("parseTableParams", () => {
  it("applies defaults for an empty query", () => {
    expect(parseTableParams({}, config)).toEqual({ page: 1, pageSize: 25, sort: { id: "updatedAt", desc: true }, q: "", filters: {} });
  });

  it("parses sort direction, page, size, search and filters", () => {
    const params = parseTableParams({ page: "3", pageSize: "50", sort: "status", q: "  binary ", status: "APPROVED,DRAFT", type: ["single-choice"] }, config);
    expect(params).toEqual({ page: 3, pageSize: 50, sort: { id: "status", desc: false }, q: "binary", filters: { status: ["APPROVED", "DRAFT"], type: ["single-choice"] } });
  });

  it("ignores unknown sort columns, bad sizes and unlisted filters", () => {
    const params = parseTableParams({ sort: "-passwordHash", pageSize: "9999", page: "-2", secret: "x" }, config);
    expect(params.sort).toEqual({ id: "updatedAt", desc: true });
    expect(params.pageSize).toBe(25);
    expect(params.page).toBe(1);
    expect(params.filters).toEqual({});
  });

  it("dedupes filter values and drops blanks", () => {
    expect(parseTableParams({ status: "DRAFT,,DRAFT, APPROVED" }, config).filters.status).toEqual(["DRAFT", "APPROVED"]);
  });
});

describe("tableParamsToSearch", () => {
  it("omits defaults", () => {
    expect(tableParamsToSearch(parseTableParams({}, config), config)).toBe("");
  });

  it("round-trips non-default state", () => {
    const raw = { q: "cpu", status: "APPROVED", sort: "-status", pageSize: "50", page: "2" };
    const search = tableParamsToSearch(parseTableParams(raw, config), config);
    expect(parseTableParams(Object.fromEntries(new URLSearchParams(search)), config)).toEqual(parseTableParams(raw, config));
  });
});
