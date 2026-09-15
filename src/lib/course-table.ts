import type { TableConfig } from "./table-params";

export const courseTableConfig: TableConfig = {
  sortable: ["code", "title"],
  filters: ["department", "level"],
  defaultSort: { id: "code", desc: false },
};

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  department: string | null;
  level: string | null;
  credits: number;
  candidates: number;
  exams: number;
};
