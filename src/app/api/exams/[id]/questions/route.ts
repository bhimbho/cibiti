import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const addQuestionSchema = z.object({ questionId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can edit exams." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = addQuestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid question." }, { status: 400 });

  const exam = await prisma.exam.findFirst({ where: { id, authorId: session.user.id } });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

  const question = await prisma.question.findUnique({ where: { id: parsed.data.questionId } });
  if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const nextOrder = await prisma.examQuestion.count({ where: { examId: id } });
  const item = await prisma.examQuestion.upsert({
    where: { examId_questionId: { examId: id, questionId: parsed.data.questionId } },
    update: {},
    create: { examId: id, questionId: parsed.data.questionId, order: nextOrder, points: question.points },
  });

  return NextResponse.json({ item }, { status: 201 });
}
