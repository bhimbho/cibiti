import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export interface CourseDetail {
  id: string;
  code: string;
  title: string;
  credits: number;
  department: { id: string; name: string } | null;
  enrollments: {
    id: string;
    role: string;
    user: { id: string; name: string | null; email: string; studentId: string | null; instructorId: string | null };
  }[];
  exams: { id: string; title: string; status: string }[];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      department: true,
      enrollments: { include: { user: true }, orderBy: { enrolledAt: "asc" } },
      exams: { select: { id: true, title: true, status: true }, orderBy: { updatedAt: "desc" } },
    },
  });

  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  return NextResponse.json({ course });
}
