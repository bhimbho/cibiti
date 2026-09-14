import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: {
      department: true,
      _count: { select: { attempts: true } },
      enrollments: { select: { course: { select: { id: true, code: true } }, role: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      studentId: s.studentId,
      department: s.department?.name ?? null,
      attempts: s._count.attempts,
      courses: s.enrollments.map((e) => ({ id: e.course.id, code: e.course.code, role: e.role })),
    })),
  });
}
