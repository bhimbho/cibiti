import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      exam: { select: { id: true, title: true, passMarkPct: true } },
      answers: true,
    },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (session.user.role === "STUDENT" && attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const snapshot = attempt.snapshot as { questionId: string; prompt: string; options?: string[]; points: number }[];
  const answerByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const review = snapshot.map((entry) => {
    const answer = answerByQuestion.get(entry.questionId);
    return {
      questionId: entry.questionId,
      prompt: entry.prompt,
      options: entry.options ?? [],
      points: entry.points,
      response: answer?.response ?? null,
      isCorrect: answer?.isCorrect ?? false,
      pointsEarned: answer?.pointsEarned ?? 0,
    };
  });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      title: attempt.exam.title,
      score: attempt.score,
      maxScore: attempt.maxScore,
      passMarkPct: attempt.exam.passMarkPct,
      submittedAt: attempt.submittedAt,
    },
    review,
  });
}
