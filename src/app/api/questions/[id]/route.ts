import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Difficulty, QuestionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const questionSchema = z.object({
  type: z.nativeEnum(QuestionType),
  prompt: z.string().trim().min(10).max(5000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
  answer: z.string().trim().min(1).max(500),
  explanation: z.string().trim().max(2000).optional(),
  difficulty: z.nativeEnum(Difficulty).default(Difficulty.MEDIUM),
  points: z.number().int().min(1).max(100).default(1),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });
  if (session.user.role !== "ADMIN" && question.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ question });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can edit questions." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Question not found." }, { status: 404 });
  if (session.user.role !== "ADMIN" && existing.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid question details." }, { status: 400 });
  const { options, answer, ...question } = parsed.data;

  const updated = await prisma.question.update({
    where: { id },
    data: { ...question, data: { options, answer } },
    select: { id: true, type: true, prompt: true, data: true, difficulty: true, points: true },
  });

  return NextResponse.json({ question: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can delete questions." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Question not found." }, { status: 404 });
  if (session.user.role !== "ADMIN" && existing.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
