import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can view analytics." }, { status: 403 });
  }

  const questions = await prisma.question.findMany({
    where: { createdById: session.user.id },
    include: { answers: true },
  });

  const analytics = questions.map((q) => {
    const graded = q.answers.filter((a) => a.isCorrect !== null);
    const correct = graded.filter((a) => a.isCorrect).length;
    const attempts = graded.length;
    const pct = attempts ? Math.round((correct / attempts) * 100) : null;
    return {
      id: q.id,
      prompt: q.prompt,
      difficulty: q.difficulty,
      attempts,
      correct,
      pct,
    };
  });

  const totalAttempts = analytics.reduce((sum, a) => sum + a.attempts, 0);
  const avgPct = totalAttempts ? Math.round(analytics.reduce((sum, a) => sum + (a.pct ?? 0) * a.attempts, 0) / totalAttempts) : 0;

  return NextResponse.json({ analytics, totalAttempts, avgPct });
}
