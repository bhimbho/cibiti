import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isStudent = session.user.role === "STUDENT";
  const attempts = await prisma.attempt.findMany({
    where: isStudent ? { userId: session.user.id } : undefined,
    include: {
      exam: { select: { id: true, title: true, passMarkPct: true } },
      ...(isStudent ? {} : { user: { select: { id: true, name: true, email: true } } }),
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ attempts });
}
