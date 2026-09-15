import type { TableConfig } from "./table-params";

export const examTableConfig: TableConfig = {
  sortable: ["updatedAt", "createdAt", "title", "status"],
  filters: ["status", "course"],
  defaultSort: { id: "updatedAt", desc: true },
};

export type ExamRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  course: string | null;
  questionCount: number;
  timeLimitMin: number | null;
  attempts: number;
  inProgress: number;
  sittings: number;
  author: string;
  updatedAt: string;
};

export const examStatusLabel: Record<ExamRow["status"], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};
