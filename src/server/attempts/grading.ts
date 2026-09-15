import { AttemptStatus, GradeMethod, Prisma, SubmissionType } from "@prisma/client";
import { scoreItem } from "@/items/registry";
import { toJson } from "../http";

type Tx = Prisma.TransactionClient;

export type FinalizeResult = { status: AttemptStatus; alreadyClosed: boolean };

/**
 * Close an in-progress attempt and auto-grade it. Idempotent and race-safe: the attempt row is
 * locked, so a candidate submit, the auto-submit job and the sweep can all call this concurrently.
 */
export async function finalizeAttempt(tx: Tx, attemptId: string, submissionType: SubmissionType, now = new Date()): Promise<FinalizeResult> {
  const locked = await tx.$queryRaw<{ status: AttemptStatus }[]>`SELECT status FROM attempt WHERE id = ${attemptId} FOR UPDATE`;
  if (locked.length === 0) throw new Error(`Attempt ${attemptId} not found.`);
  if (locked[0].status !== AttemptStatus.IN_PROGRESS) return { status: locked[0].status, alreadyClosed: true };

  const attempt = await tx.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      exam: { select: { negativeMarking: true, passMarkPct: true, releasePolicy: true } },
      items: { include: { version: true, response: true } },
    },
  });

  let total = 0;
  let needsManual = false;
  for (const item of attempt.items) {
    const result = scoreItem(
      item.version.type,
      { interaction: item.version.interaction, scoring: item.version.scoring, response: item.response?.value ?? null },
      { maxPoints: item.points, negativeMarking: attempt.exam.negativeMarking },
    );
    total += result.points;
    needsManual ||= result.needsManualGrading;
    const data = {
      points: result.points,
      maxPoints: result.maxPoints,
      isCorrect: result.isCorrect,
      method: GradeMethod.AUTO,
      detail: result.detail ? (toJson(result.detail) as Prisma.InputJsonValue) : Prisma.JsonNull,
      gradedAt: now,
    };
    await tx.itemGrade.upsert({ where: { attemptItemId: item.id }, create: { attemptItemId: item.id, ...data }, update: data });
  }

  // Negative marking can push the raw sum below zero; an exam score never goes negative.
  const score = Math.max(0, Math.round(total * 1000) / 1000);
  const percent = attempt.maxScore > 0 ? Math.round((score / attempt.maxScore) * 10000) / 100 : 0;
  const status = needsManual ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED;

  await tx.attempt.update({
    where: { id: attemptId },
    data: {
      status,
      submissionType,
      submittedAt: now,
      score,
      percent,
      passed: needsManual ? null : percent >= attempt.exam.passMarkPct,
      gradedAt: needsManual ? null : now,
      releasedAt: attempt.exam.releasePolicy === "IMMEDIATE" && !needsManual ? now : null,
    },
  });

  await tx.proctorEvent.create({
    data: { attemptId, type: "attempt.submitted", severity: "INFO", payload: { submissionType } },
  });

  return { status, alreadyClosed: false };
}
