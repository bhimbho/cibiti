import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const courseSchema = z.object({
  code: z.string().trim().min(2).max(20),
  title: z.string().trim().min(3).max(160),
  credits: z.number().int().min(0).max(30).default(3),
  departmentId: z.string().min(1).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const include = { department: true, _count: { select: { enrollments: true, exams: true } } };

  const courses = await prisma.course.findMany({
    where:
      session.user.role === "STUDENT"
        ? { enrollments: { some: { userId: session.user.id } } }
        : undefined,
    include,
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can create courses." }, { status: 403 });
  }

  const parsed = courseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid course details." }, { status: 400 });

  const existing = await prisma.course.findUnique({ where: { code: parsed.data.code.toUpperCase() } });
  if (existing) return NextResponse.json({ error: "A course with this code already exists." }, { status: 409 });

  const course = await prisma.course.create({
    data: {
      code: parsed.data.code.toUpperCase(),
      title: parsed.data.title,
      credits: parsed.data.credits,
      departmentId: parsed.data.departmentId,
    },
    include: { department: true, _count: { select: { enrollments: true, exams: true } } },
  });

  return NextResponse.json({ course }, { status: 201 });
}
