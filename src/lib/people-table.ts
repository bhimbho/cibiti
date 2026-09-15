import type { TableConfig } from "./table-params";

export const peopleTableConfig: TableConfig = {
  sortable: ["name", "createdAt", "regNumber"],
  filters: ["role", "department", "level", "active"],
  defaultSort: { id: "name", desc: false },
};

export type RoleKey = "SUPER_ADMIN" | "ORG_ADMIN" | "EXAM_OFFICER" | "AUTHOR" | "REVIEWER" | "GRADER" | "INVIGILATOR" | "CANDIDATE";

export type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  regNumber: string | null;
  roles: RoleKey[];
  department: string | null;
  level: string | null;
  active: boolean;
  courses: number;
  attempts: number;
  createdAt: string;
};

export const roleLabels: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Administrator",
  EXAM_OFFICER: "Exam officer",
  AUTHOR: "Instructor",
  REVIEWER: "Reviewer",
  GRADER: "Grader",
  INVIGILATOR: "Invigilator",
  CANDIDATE: "Candidate",
};
