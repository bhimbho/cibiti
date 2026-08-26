import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AttemptStatus, Difficulty } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const answerSchema = z.object({
  questionId: z.string().min(1),
  response: z.unknown(),
});

function normalize(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function difficultyForAbility(ability: number): Difficulty {
  if (ability <= -1) return Difficulty.EASY;
  if (ability >= 1) return Difficulty.HARD;
  return Difficulty.MEDIUM;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = answerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid answer." }, { status: 400 });

  const attempt = await prisma.attempt.findUnique({ where: { id } });
  if (!attempt || attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409 });
  }

  const snapshot = attempt.snapshot as { adaptive: boolean; ability: number; asked: string[]; answers: { questionId: string; correct: boolean }[] };
  if (!snapshot.adaptive) return NextResponse.json({ error: "Not an adaptive attempt." }, { status: 400 });

  // Grade the previous answer and update ability.
  const previousQuestion = await prisma.question.findUnique({ where: { id: parsed.data.questionId } });
  if (previousQuestion) {
    const correct = normalize(parsed.data.response) === normalize((previousQuestion.data as { answer?: unknown }).answer);
    snapshot.ability += correct ? 1 : -1;
    snapshot.answers.push({ questionId: previousQuestion.id, correct });
  }

  // Select the next question by difficulty, avoiding repeats.
  const targetDifficulty = difficultyForAbility(snapshot.ability);
  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, include: { items: { include: { question: true } } } });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

  const pool = exam.items.map((item) => item.question).filter((q) => !snapshot.asked.includes(q.id));
  if (pool.length === 0) {
    return NextResponse.json({ done: true, ability: snapshot.ability, total: snapshot.answers.length });
  }

  const preferred = pool.filter((q) => q.difficulty === targetDifficulty);
  const next = (preferred.length > 0 ? preferred : pool)[0];
  snapshot.asked.push(next.id);

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { snapshot },
  });

  const data = next.data as { options?: string[] };
  return NextResponse.json({
    question: { questionId: next.id, type: next.type, prompt: next.prompt, options: data.options ?? [], points: next.points },
    ability: snapshot.ability,
    answered: snapshot.answers.length,
    remaining: pool.length - 1,
  });
}
