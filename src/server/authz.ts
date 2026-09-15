import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "./http";

export type Permission =
  | "org:manage"
  | "people:manage"
  | "academics:manage"
  | "flags:manage"
  | "audit:read"
  | "question:read"
  | "question:write"
  | "question:review"
  | "exam:read"
  | "exam:write"
  | "exam:publish"
  | "results:read"
  | "grade:write"
  | "invigilate"
  | "attempt:take";

const staffRead: Permission[] = ["question:read", "exam:read", "results:read"];

const rolePermissions: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "org:manage", "people:manage", "academics:manage", "flags:manage", "audit:read",
    "question:read", "question:write", "question:review", "exam:read", "exam:write", "exam:publish",
    "results:read", "grade:write", "invigilate",
  ],
  ORG_ADMIN: [
    "org:manage", "people:manage", "academics:manage", "flags:manage", "audit:read",
    "question:read", "question:write", "question:review", "exam:read", "exam:write", "exam:publish",
    "results:read", "grade:write", "invigilate",
  ],
  EXAM_OFFICER: [...staffRead, "people:manage", "academics:manage", "question:write", "exam:write", "exam:publish", "grade:write", "invigilate", "audit:read"],
  AUTHOR: [...staffRead, "question:write", "exam:write"],
  REVIEWER: [...staffRead, "question:review"],
  GRADER: ["exam:read", "results:read", "grade:write"],
  INVIGILATOR: ["exam:read", "invigilate"],
  CANDIDATE: ["attempt:take"],
};

export const staffRoles: Role[] = [Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.EXAM_OFFICER, Role.AUTHOR, Role.REVIEWER, Role.GRADER, Role.INVIGILATOR];

export type Scope = { departmentId?: string | null; courseId?: string | null };

export type Actor = {
  userId: string;
  orgId: string;
  name: string;
  roles: Role[];
  memberships: { role: Role; departmentId: string | null; courseId: string | null }[];
  isStaff: boolean;
  isCandidate: boolean;
};

export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return actorForUser(userId);
}

/** Build an actor for a user id (sessions and background jobs). Inactive users get no actor. */
export async function actorForUser(userId: string): Promise<Actor | null> {
  // Roles are always read from the database so revoked access takes effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, orgId: true, name: true, isActive: true, memberships: { select: { role: true, departmentId: true, courseId: true } } },
  });
  if (!user || !user.isActive) return null;

  const roles = [...new Set(user.memberships.map((m) => m.role))];
  return {
    userId: user.id,
    orgId: user.orgId,
    name: user.name,
    roles,
    memberships: user.memberships,
    isStaff: roles.some((r) => staffRoles.includes(r)),
    isCandidate: roles.includes(Role.CANDIDATE),
  };
}

/**
 * True when any membership grants the permission for the scope.
 * Org-wide memberships (no department/course) cover every scope; scoped memberships only match their own.
 */
export function can(actor: Actor, permission: Permission, scope: Scope = {}): boolean {
  return actor.memberships.some((m) => {
    if (!rolePermissions[m.role].includes(permission)) return false;
    if (!m.departmentId && !m.courseId) return true;
    if (m.courseId) return m.courseId === scope.courseId;
    return m.departmentId === scope.departmentId;
  });
}

/** Any membership grants the permission somewhere (used to show navigation and list pages). */
export function canAnywhere(actor: Actor, permission: Permission): boolean {
  return actor.memberships.some((m) => rolePermissions[m.role].includes(permission));
}

export async function requireActor(permission?: Permission, scope?: Scope): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw unauthorized();
  if (permission && !(scope ? can(actor, permission, scope) : canAnywhere(actor, permission))) throw forbidden();
  return actor;
}

export function permissionsFor(actor: Actor): Permission[] {
  return [...new Set(actor.memberships.flatMap((m) => rolePermissions[m.role]))];
}
