import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roleLabels, type PersonRow } from "@/lib/people-table";
import type { TableParams } from "@/lib/table-params";
import type { Actor } from "../authz";

const roles = Object.values(Role);

const orderBy: Record<string, (dir: Prisma.SortOrder) => Prisma.UserOrderByWithRelationInput> = {
  name: (dir) => ({ name: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  regNumber: (dir) => ({ regNumber: { sort: dir, nulls: "last" } }),
};

export async function listPeople(actor: Actor, params: TableParams) {
  const { filters } = params;
  const where: Prisma.UserWhereInput = {
    orgId: actor.orgId,
    ...(filters.role ? { memberships: { some: { role: { in: filters.role.filter((r): r is Role => roles.includes(r as Role)) } } } } : {}),
    ...(filters.department ? { departmentId: { in: filters.department } } : {}),
    ...(filters.level ? { levelId: { in: filters.level } } : {}),
    ...(filters.active?.length === 1 ? { isActive: filters.active[0] === "active" } : {}),
    ...(params.q
      ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }, { regNumber: { contains: params.q, mode: "insensitive" } }] }
      : {}),
  };
  const sort = params.sort ?? { id: "name", desc: false };

  const [total, users, departments, levels] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [(orderBy[sort.id] ?? orderBy.name)(sort.desc ? "desc" : "asc"), { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        memberships: { select: { role: true } },
        department: { select: { code: true } },
        level: { select: { name: true } },
        _count: { select: { enrollments: true, attempts: true } },
      },
    }),
    prisma.department.findMany({ where: { orgId: actor.orgId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.level.findMany({ where: { orgId: actor.orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: PersonRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    regNumber: u.regNumber,
    roles: [...new Set(u.memberships.map((m) => m.role))],
    department: u.department?.code ?? null,
    level: u.level?.name ?? null,
    active: u.isActive,
    courses: u._count.enrollments,
    attempts: u._count.attempts,
    createdAt: u.createdAt.toISOString(),
  }));

  return {
    rows,
    total,
    facets: {
      role: roles.filter((r) => r !== Role.SUPER_ADMIN).map((r) => ({ value: r, label: roleLabels[r] })),
      department: departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
      level: levels.map((l) => ({ value: l.id, label: l.name })),
      active: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Deactivated" },
      ],
    },
  };
}
