import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: { exam: { select: { title: true, passMarkPct: true } }, user: { select: { name: true, email: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (session.user.role === "STUDENT" && attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const pct = attempt.maxScore ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100) : 0;
  if (pct < attempt.exam.passMarkPct) {
    return NextResponse.json({ error: "A certificate is only issued for passing scores." }, { status: 400 });
  }

  return NextResponse.json({
    certificate: {
      studentName: attempt.user.name ?? attempt.user.email,
      examTitle: attempt.exam.title,
      score: attempt.score,
      maxScore: attempt.maxScore,
      pct,
      issuedAt: attempt.submittedAt,
    },
  });
}
