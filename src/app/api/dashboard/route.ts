import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isStudent = session.user.role === "STUDENT";

  const [publishedExams, recentAttempts, completedCount, avgScore] = await Promise.all([
    prisma.exam.findMany({
      where: isStudent ? { status: "PUBLISHED" } : { authorId: session.user.id },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.attempt.findMany({
      where: isStudent ? { userId: session.user.id } : undefined,
      include: { exam: { select: { title: true } } },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    prisma.attempt.count({ where: isStudent ? { userId: session.user.id, status: "GRADED" } : undefined }),
    prisma.attempt.aggregate({ where: isStudent ? { userId: session.user.id, status: "GRADED" } : undefined, _avg: { score: true } }),
  ]);

  return NextResponse.json({
    role: session.user.role,
    name: session.user.name,
    exams: publishedExams.map((e) => ({ id: e.id, title: e.title, questionCount: e._count.items, timeLimitMin: e.timeLimitMin })),
    recentAttempts: recentAttempts.map((a) => ({ id: a.id, title: a.exam.title, score: a.score, maxScore: a.maxScore, submittedAt: a.submittedAt })),
    completedCount,
    avgScore: avgScore._avg.score,
  });
}
