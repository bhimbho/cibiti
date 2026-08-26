import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      items: { include: { question: true }, orderBy: { order: "asc" } },
    },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (session.user.role === "STUDENT" && exam.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
  }
  if (session.user.role !== "STUDENT" && exam.authorId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ exam });
}
