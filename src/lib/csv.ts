/** RFC 4180 CSV parsing: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const normaliseHeader = (header: string) => header.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** Parse CSV with a header row into records keyed by canonical column names. */
export function csvRecords(text: string, aliases: Record<string, string[]>) {
  const [headerRow = [], ...body] = parseCsv(text);
  const lookup = new Map<string, string>();
  for (const [canonical, names] of Object.entries(aliases)) {
    for (const name of [canonical, ...names]) lookup.set(normaliseHeader(name), canonical);
  }
  const columns = headerRow.map((h) => lookup.get(normaliseHeader(h)) ?? null);
  const unknownHeaders = headerRow.filter((_, i) => columns[i] === null).map((h) => h.trim()).filter(Boolean);
  const records = body.map((cells) => {
    const record: Record<string, string> = {};
    columns.forEach((column, i) => {
      if (column) record[column] = (cells[i] ?? "").trim();
    });
    return record;
  });
  return { columns: columns.filter((c): c is string => c !== null), unknownHeaders, records };
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = value === null || value === undefined ? "" : String(value);
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}
