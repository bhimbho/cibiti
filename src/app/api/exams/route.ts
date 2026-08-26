import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ExamStatus } from "@prisma/client";
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

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const exams = await prisma.exam.findMany({
    where: session.user.role === "STUDENT" ? { status: ExamStatus.PUBLISHED } : { authorId: session.user.id },
    include: { _count: { select: { items: true, attempts: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ exams });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can create exams." }, { status: 403 });
  }
  const parsed = examSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exam details." }, { status: 400 });
  const exam = await prisma.exam.create({ data: { ...parsed.data, authorId: session.user.id } });
  return NextResponse.json({ exam }, { status: 201 });
}
