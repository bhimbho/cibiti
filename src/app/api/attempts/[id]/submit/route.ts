import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AttemptStatus, Prisma, QuestionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const submitSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

function normalize(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function isCorrect(type: QuestionType, response: unknown, correct: unknown): boolean {
  if (type === QuestionType.MULTIPLE_CHOICE || type === QuestionType.TRUE_FALSE || type === QuestionType.SHORT_ANSWER) {
    return normalize(response) === normalize(correct);
  }
  return normalize(response) === normalize(correct);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: { exam: { include: { items: { include: { question: true } } } } },
  });
  if (!attempt || attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409 });
  }

  const snapshot = attempt.snapshot as { questionId: string; points: number }[];
  const questionById = new Map(attempt.exam.items.map((item) => [item.question.id, item.question]));

  let score = 0;
  const answerData = snapshot.map((entry) => {
    const question = questionById.get(entry.questionId);
    const response = parsed.data.answers[entry.questionId] ?? null;
    const correct = question ? (question.data as { answer?: unknown }).answer : undefined;
    const correctFlag = question ? isCorrect(question.type, response, correct) : false;
    if (correctFlag) score += entry.points;
    return {
      attemptId: attempt.id,
      questionId: entry.questionId,
      response: response ?? Prisma.JsonNull,
      isCorrect: correctFlag,
      pointsEarned: correctFlag ? entry.points : 0,
      gradedAt: new Date(),
    };
  });

  await prisma.$transaction([
    prisma.attemptAnswer.createMany({ data: answerData }),
    prisma.attempt.update({
      where: { id: attempt.id },
      data: { status: AttemptStatus.GRADED, score, submittedAt: new Date() },
    }),
  ]);

  const passMarkPct = attempt.exam.passMarkPct;
  const pct = attempt.maxScore ? Math.round((score / attempt.maxScore) * 100) : 0;
  return NextResponse.json({ result: { score, maxScore: attempt.maxScore, pct, passed: pct >= passMarkPct } });
}
