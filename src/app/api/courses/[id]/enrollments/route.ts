import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

// Enroll a user (by email) into a course. Instructor/Admin only.
const enrollSchema = z.object({
  email: z.string().email(),
  role: z.enum(["STUDENT", "INSTRUCTOR"]).default("STUDENT"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can manage enrollments." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = enrollSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid email address." }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: "No user with that email exists." }, { status: 404 });

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: id } },
  });
  if (existing) return NextResponse.json({ error: "That user is already enrolled." }, { status: 409 });

  const enrollment = await prisma.enrollment.create({
    data: { userId: user.id, courseId: id, role: parsed.data.role },
    include: { user: true },
  });
  return NextResponse.json({ enrollment }, { status: 201 });
}

// Change a member's role
const roleSchema = z.object({ role: z.enum(["STUDENT", "INSTRUCTOR"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

  const enrollment = await prisma.enrollment.update({
    where: { id },
    data: { role: parsed.data.role },
  });
  return NextResponse.json({ enrollment });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const enrollmentId = typeof body.enrollmentId === "string" ? body.enrollmentId : "";
  if (!enrollmentId) return NextResponse.json({ error: "Missing enrollment id." }, { status: 400 });

  await prisma.enrollment.delete({ where: { id: enrollmentId } });
  return NextResponse.json({ ok: true });
}
