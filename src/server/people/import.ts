import { Role } from "@prisma/client";
import { z } from "zod";
import { csvRecords } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import type { Actor } from "../authz";
import { grantableRoles } from "./mutate";

export const IMPORT_MAX_ROWS = 5000;

export const importColumns = {
  name: ["full name", "fullname", "candidate name", "student name"],
  email: ["email address", "e-mail"],
  regNumber: ["matric", "matric number", "matric no", "reg number", "registration number", "reg no", "admission number", "candidate number"],
  role: ["roles"],
  department: ["department code", "dept"],
  level: ["class", "level name"],
  groups: ["group", "arm", "batch"],
  courses: ["course", "course codes"],
  password: [],
};

const roleAliases: Record<string, Role> = {
  candidate: Role.CANDIDATE,
  student: Role.CANDIDATE,
  instructor: Role.AUTHOR,
  author: Role.AUTHOR,
  lecturer: Role.AUTHOR,
  teacher: Role.AUTHOR,
  reviewer: Role.REVIEWER,
  grader: Role.GRADER,
  marker: Role.GRADER,
  invigilator: Role.INVIGILATOR,
  examofficer: Role.EXAM_OFFICER,
  officer: Role.EXAM_OFFICER,
  admin: Role.ORG_ADMIN,
  administrator: Role.ORG_ADMIN,
};

export type ImportRow = {
  line: number;
  name: string;
  email: string | null;
  regNumber: string | null;
  roles: Role[];
  departmentId: string | null;
  levelId: string | null;
  groupIds: string[];
  courseIds: string[];
  password: string | null;
  errors: string[];
};

const split = (value: string | undefined) => (value ?? "").split(/[;|]/).map((v) => v.trim()).filter(Boolean);

/** Validate a CSV of people without writing anything. Every problem is reported per line. */
export async function validatePeopleImport(actor: Actor, text: string) {
  const { records, unknownHeaders, columns } = csvRecords(text, importColumns);
  const problems: string[] = [];
  if (!columns.includes("name")) problems.push('The file needs a "name" column.');
  if (!columns.includes("email") && !columns.includes("regNumber")) problems.push('The file needs an "email" or "matric number" column.');
  if (records.length > IMPORT_MAX_ROWS) problems.push(`Files can have at most ${IMPORT_MAX_ROWS} rows; this one has ${records.length}.`);
  if (problems.length) return { rows: [], problems, unknownHeaders };

  const [departments, levels, groups, courses] = await Promise.all([
    prisma.department.findMany({ where: { orgId: actor.orgId }, select: { id: true, code: true } }),
    prisma.level.findMany({ where: { orgId: actor.orgId }, select: { id: true, name: true } }),
    prisma.candidateGroup.findMany({ where: { orgId: actor.orgId }, select: { id: true, name: true } }),
    prisma.course.findMany({ where: { orgId: actor.orgId }, select: { id: true, code: true } }),
  ]);
  const byKey = <T extends { id: string }>(items: T[], key: (item: T) => string) => new Map(items.map((i) => [key(i).toLowerCase(), i.id]));
  const departmentIds = byKey(departments, (d) => d.code);
  const levelIds = byKey(levels, (l) => l.name);
  const groupIds = byKey(groups, (g) => g.name);
  const courseIds = byKey(courses, (c) => c.code);
  const allowed = grantableRoles(actor);

  const emails = records.map((r) => r.email?.toLowerCase()).filter((e): e is string => Boolean(e));
  const regs = records.map((r) => r.regNumber).filter((r): r is string => Boolean(r));
  const [existingEmails, existingRegs] = await Promise.all([
    emails.length ? prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }) : [],
    regs.length ? prisma.user.findMany({ where: { orgId: actor.orgId, regNumber: { in: regs, mode: "insensitive" } }, select: { regNumber: true } }) : [],
  ]);
  const takenEmails = new Set(existingEmails.map((u) => u.email!.toLowerCase()));
  const takenRegs = new Set(existingRegs.map((u) => u.regNumber!.toLowerCase()));
  const seenEmails = new Map<string, number>();
  const seenRegs = new Map<string, number>();

  const rows: ImportRow[] = records.map((record, index) => {
    const line = index + 2; // header is line 1
    const errors: string[] = [];
    const name = record.name ?? "";
    const email = record.email ? record.email.toLowerCase() : null;
    const regNumber = record.regNumber || null;

    if (name.length < 2) errors.push("Name is missing.");
    if (!email && !regNumber) errors.push("Needs an email or matric number.");
    if (email && !z.email().safeParse(email).success) errors.push(`"${record.email}" is not a valid email.`);
    if (email) {
      if (takenEmails.has(email)) errors.push("Email already has an account.");
      if (seenEmails.has(email)) errors.push(`Email repeats line ${seenEmails.get(email)}.`);
      seenEmails.set(email, line);
    }
    if (regNumber) {
      const key = regNumber.toLowerCase();
      if (takenRegs.has(key)) errors.push("Matric number already has an account.");
      if (seenRegs.has(key)) errors.push(`Matric number repeats line ${seenRegs.get(key)}.`);
      seenRegs.set(key, line);
    }

    const roles = split(record.role).map((r) => {
      const role = roleAliases[r.toLowerCase().replace(/[\s_-]+/g, "")] ?? (Object.values(Role) as string[]).find((v) => v === r.toUpperCase());
      if (!role) errors.push(`Unknown role "${r}".`);
      return role as Role;
    });
    const finalRoles = roles.filter(Boolean).length ? [...new Set(roles.filter(Boolean))] : [Role.CANDIDATE];
    for (const role of finalRoles) if (!allowed.includes(role)) errors.push(`You cannot grant the ${role.toLowerCase()} role.`);

    const lookup = (map: Map<string, string>, value: string | undefined, label: string) => {
      if (!value) return null;
      const id = map.get(value.toLowerCase());
      if (!id) errors.push(`Unknown ${label} "${value}".`);
      return id ?? null;
    };

    const departmentId = lookup(departmentIds, record.department, "department");
    const levelId = lookup(levelIds, record.level, "level");
    const rowGroups = split(record.groups).map((g) => lookup(groupIds, g, "group")).filter((g): g is string => Boolean(g));
    const rowCourses = split(record.courses).map((c) => lookup(courseIds, c, "course")).filter((c): c is string => Boolean(c));
    const password = record.password || null;
    if (password && password.length < 6) errors.push("Password must be at least 6 characters.");

    return { line, name, email, regNumber, roles: finalRoles, departmentId, levelId, groupIds: rowGroups, courseIds: rowCourses, password, errors };
  });

  return { rows, problems, unknownHeaders };
}
