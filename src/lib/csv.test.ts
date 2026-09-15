import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows with CRLF and a BOM", () => {
    expect(parseCsv("﻿name,reg\r\nAda,CSC/1\r\nTunde,CSC/2\r\n")).toEqual([
      ["name", "reg"],
      ["Ada", "CSC/1"],
      ["Tunde", "CSC/2"],
    ]);
  });

  it("handles quotes, escaped quotes, commas and newlines inside fields", () => {
    expect(parseCsv('name,note\n"Obi, Chiamaka","said ""hi""\nthen left"')).toEqual([
      ["name", "note"],
      ["Obi, Chiamaka", 'said "hi"\nthen left'],
    ]);
  });

  it("skips blank lines and keeps empty cells", () => {
    expect(parseCsv("a,b,c\n\n1,,3\n  \n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
});

describe("csvRecords", () => {
  it("maps header aliases and reports unknown columns", () => {
    const { records, unknownHeaders, columns } = csvRecords("Full Name,Matric Number,Email,Shoe size\nAda Obi, CSC/2026/010 ,ada@x.ng,42", {
      name: ["full name"],
      regNumber: ["matric number", "matric", "reg number"],
      email: [],
    });
    expect(columns).toEqual(["name", "regNumber", "email"]);
    expect(unknownHeaders).toEqual(["Shoe size"]);
    expect(records).toEqual([{ name: "Ada Obi", regNumber: "CSC/2026/010", email: "ada@x.ng" }]);
  });
});

describe("toCsv", () => {
  it("quotes only when needed and round-trips", () => {
    const rows = [["name", "password"], ["Obi, C", 'a"b'], ["Plain", null]];
    const text = toCsv(rows);
    expect(text).toBe('name,password\r\n"Obi, C","a""b"\r\nPlain,');
    expect(parseCsv(text)).toEqual([["name", "password"], ["Obi, C", 'a"b'], ["Plain", ""]]);
  });
});
