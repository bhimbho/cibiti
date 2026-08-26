import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const examSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  timeLimitMin: z.number().int().min(1).max(480).nullable(),
  passMarkPct: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(20),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  adaptive: z.boolean(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      items: { include: { question: true }, orderBy: { order: "asc" } },
    },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (session.user.role === "STUDENT" && exam.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
  }
  if (session.user.role !== "STUDENT" && exam.authorId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ exam });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can edit exams." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.exam.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (session.user.role !== "ADMIN" && existing.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = examSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exam details." }, { status: 400 });

  const updated = await prisma.exam.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ exam: updated });
}
