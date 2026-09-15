import type { Role } from "@prisma/client";
import type { Permission } from "@/server/authz";

export type NavIcon = "overview" | "questions" | "exams" | "people" | "academics" | "results" | "invigilation" | "settings";

export type NavItem = { href: string; label: string; icon: NavIcon };

// Entries appear once their pages exist; `permission` controls who sees them.
// `permission` lists alternatives: the entry shows when the user has any of them.
const navigation: (NavItem & { permission?: Permission[] })[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/exams", label: "Exams", icon: "exams", permission: ["exam:write"] },
  { href: "/questions", label: "Question bank", icon: "questions", permission: ["question:read"] },
  { href: "/results", label: "Results", icon: "results", permission: ["results:read", "attempt:take"] },
  { href: "/people", label: "People", icon: "people", permission: ["people:manage"] },
  { href: "/academics", label: "Academics", icon: "academics", permission: ["academics:manage"] },
];

export function navFor(permissions: Permission[]): NavItem[] {
  return navigation
    .filter((item) => !item.permission || item.permission.some((p) => permissions.includes(p)))
    .map(({ href, label, icon }) => ({ href, label, icon }));
}

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Administrator",
  EXAM_OFFICER: "Exam officer",
  AUTHOR: "Instructor",
  REVIEWER: "Reviewer",
  GRADER: "Grader",
  INVIGILATOR: "Invigilator",
  CANDIDATE: "Candidate",
};

const rolePriority: Role[] = ["SUPER_ADMIN", "ORG_ADMIN", "EXAM_OFFICER", "AUTHOR", "REVIEWER", "GRADER", "INVIGILATOR", "CANDIDATE"];

export function primaryRoleLabel(roles: Role[]): string {
  const role = rolePriority.find((r) => roles.includes(r));
  return role ? roleLabels[role] : "No role assigned";
}
