import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AttemptStatus, ExamStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const startSchema = z.object({ examId: z.string().min(1) });

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exam." }, { status: 400 });

  const exam = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    include: {
      items: {
        include: { question: true },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!exam || exam.status !== ExamStatus.PUBLISHED) {
    return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
  }

  const recentAttempts = await prisma.attempt.count({
    where: { examId: exam.id, userId: session.user.id, status: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.SUBMITTED, AttemptStatus.GRADED] } },
  });
  if (recentAttempts >= exam.maxAttempts) {
    return NextResponse.json({ error: "You have used all allowed attempts." }, { status: 403 });
  }

  let orderedItems = exam.items;
  if (exam.shuffleQuestions) orderedItems = shuffle(orderedItems);

  const snapshot = orderedItems.map((item) => {
    const data = item.question.data as { options?: string[]; answer?: string };
    const options = exam.shuffleOptions && data.options ? shuffle(data.options) : data.options;
    return {
      questionId: item.question.id,
      type: item.question.type,
      prompt: item.question.prompt,
      options,
      points: item.points,
    };
  });

  const attempt = await prisma.attempt.create({
    data: {
      examId: exam.id,
      userId: session.user.id,
      status: AttemptStatus.IN_PROGRESS,
      maxScore: snapshot.reduce((sum, q) => sum + q.points, 0),
      snapshot,
    },
  });

  return NextResponse.json({
    attempt: { id: attempt.id, startedAt: attempt.startedAt, timeLimitMin: exam.timeLimitMin, maxScore: attempt.maxScore },
    questions: snapshot,
  }, { status: 201 });
}
