import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AttemptStatus, ExamStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const startSchema = z.object({ examId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exam." }, { status: 400 });

  const exam = await prisma.exam.findUnique({ where: { id: parsed.data.examId } });
  if (!exam || exam.status !== ExamStatus.PUBLISHED) {
    return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
  }
  if (!exam.adaptive) {
    return NextResponse.json({ error: "This exam is not adaptive." }, { status: 400 });
  }

  const recentAttempts = await prisma.attempt.count({
    where: { examId: exam.id, userId: session.user.id, status: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.SUBMITTED, AttemptStatus.GRADED] } },
  });
  if (recentAttempts >= exam.maxAttempts) {
    return NextResponse.json({ error: "You have used all allowed attempts." }, { status: 403 });
  }

  const attempt = await prisma.attempt.create({
    data: {
      examId: exam.id,
      userId: session.user.id,
      status: AttemptStatus.IN_PROGRESS,
      maxScore: 0,
      snapshot: { adaptive: true, ability: 0, asked: [], answers: [] },
    },
  });

  return NextResponse.json({ attempt: { id: attempt.id, timeLimitMin: exam.timeLimitMin } }, { status: 201 });
}
