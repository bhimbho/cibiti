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

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const questions = await prisma.question.findMany({
    where: session.user.role === "STUDENT" ? { examItems: { some: { exam: { status: "PUBLISHED" } } } } : undefined,
    orderBy: { updatedAt: "desc" },
    select: { id: true, type: true, prompt: true, data: true, difficulty: true, points: true, updatedAt: true },
  });
  return NextResponse.json({ questions });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only instructors can create questions." }, { status: 403 });
  }
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid question details." }, { status: 400 });
  const { options, answer, ...question } = parsed.data;
  const created = await prisma.question.create({
    data: { ...question, data: { options, answer }, createdById: session.user.id },
    select: { id: true, type: true, prompt: true, data: true, difficulty: true, points: true },
  });
  return NextResponse.json({ question: created }, { status: 201 });
}
