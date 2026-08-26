import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ExamStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can publish exams." }, { status: 403 });
  }

  const { id } = await params;
  const exam = await prisma.exam.findFirst({ where: { id, authorId: session.user.id }, include: { _count: { select: { items: true } } } });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (exam._count.items === 0) {
    return NextResponse.json({ error: "Add at least one question before publishing." }, { status: 400 });
  }

  const updated = await prisma.exam.update({ where: { id }, data: { status: ExamStatus.PUBLISHED } });
  return NextResponse.json({ exam: updated });
}
