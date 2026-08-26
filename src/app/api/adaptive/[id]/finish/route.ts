import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AttemptStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attempt = await prisma.attempt.findUnique({ where: { id }, include: { exam: true } });
  if (!attempt || attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409 });
  }

  const snapshot = attempt.snapshot as { adaptive: boolean; ability: number; asked: string[]; answers: { questionId: string; correct: boolean }[] };
  if (!snapshot.adaptive) return NextResponse.json({ error: "Not an adaptive attempt." }, { status: 400 });

  const questions = await prisma.question.findMany({ where: { id: { in: snapshot.asked } } });
  const pointsById = new Map(questions.map((q) => [q.id, q.points]));
  const score = snapshot.answers.reduce((sum, a) => sum + (a.correct ? (pointsById.get(a.questionId) ?? 1) : 0), 0);
  const maxScore = snapshot.asked.reduce((sum, id) => sum + (pointsById.get(id) ?? 1), 0);

  const answerData = snapshot.answers.map((a) => ({
    attemptId: attempt.id,
    questionId: a.questionId,
    response: Prisma.JsonNull,
    isCorrect: a.correct,
    pointsEarned: a.correct ? (pointsById.get(a.questionId) ?? 1) : 0,
    gradedAt: new Date(),
  }));

  await prisma.$transaction([
    prisma.attemptAnswer.createMany({ data: answerData }),
    prisma.attempt.update({
      where: { id: attempt.id },
      data: { status: AttemptStatus.GRADED, score, maxScore, submittedAt: new Date() },
    }),
  ]);

  const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
  return NextResponse.json({ result: { score, maxScore, pct, passed: pct >= attempt.exam.passMarkPct, ability: snapshot.ability } });
}
