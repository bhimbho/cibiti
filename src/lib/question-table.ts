import type { TableConfig } from "./table-params";

export const questionTableConfig: TableConfig = {
  sortable: ["updatedAt", "createdAt", "status", "difficulty", "type", "points"],
  filters: ["status", "type", "difficulty", "subject"],
  defaultSort: { id: "updatedAt", desc: true },
};

export type QuestionRow = {
  id: string;
  text: string;
  type: string;
  typeLabel: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETIRED";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  points: number;
  subject: string | null;
  topic: string | null;
  author: string;
  usedInExams: number;
  updatedAt: string;
};

export type FacetOption = { value: string; label: string };

export type QuestionFacets = {
  status: FacetOption[];
  type: FacetOption[];
  difficulty: FacetOption[];
  subject: FacetOption[];
};
