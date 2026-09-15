import type { TableConfig } from "./table-params";

export const resultsTableConfig: TableConfig = {
  sortable: ["submittedAt", "startedAt", "percent", "candidate"],
  filters: ["exam", "status", "outcome", "released"],
  defaultSort: { id: "submittedAt", desc: true },
};

export type ResultRow = {
  id: string;
  candidate: string;
  regNumber: string | null;
  exam: string;
  examId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "VOIDED";
  submissionType: "CANDIDATE" | "TIME_EXPIRED" | "INVIGILATOR" | null;
  score: number | null;
  maxScore: number;
  percent: number | null;
  passed: boolean | null;
  released: boolean;
  flags: number;
  startedAt: string;
  submittedAt: string | null;
  durationMin: number | null;
};

export const attemptStatusLabel: Record<ResultRow["status"], string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Needs marking",
  GRADED: "Graded",
  VOIDED: "Voided",
};
