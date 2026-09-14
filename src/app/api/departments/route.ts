import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(15).toUpperCase(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const departments = await prisma.department.findMany({
    include: { _count: { select: { courses: true, users: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ departments });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors and admins can create departments." }, { status: 403 });
  }

  const parsed = departmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid department name and code." }, { status: 400 });

  const existing = await prisma.department.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ error: "A department with this code already exists." }, { status: 409 });

  const department = await prisma.department.create({ data: parsed.data });
  return NextResponse.json({ department }, { status: 201 });
}
