import { AttemptStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import type { Actor } from "../authz";
import { conflict, forbidden, notFound } from "../http";
import { scheduleAutoSubmit } from "../queue";
import { canRestartAttempt } from "./policy";
import { examDayPolicy, standingOf } from "./store";

export const restartSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason — it goes in the audit log.").max(300),
});

/**
 * Give a candidate a fresh start after something went wrong: a machine died mid-paper,
 * the wrong person signed in, a power cut took the hall down.
 *
 * The broken attempt is voided rather than deleted — its answers, timing and
 * integrity events stay on record, which is what makes the decision reviewable
 * afterwards. A voided attempt does not count against the exam's attempt limit, so
 * voiding is itself what frees the candidate to sit again; they then get an entirely
 * new paper, drawn from a new seed.
 */
export async function restartAttempt(actor: Actor, attemptId: string, input: z.infer<typeof restartSchema>) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, exam: { orgId: actor.orgId } },
    select: {
      id: true,
      examId: true,
      userId: true,
      status: true,
      releasedAt: true,
      exam: { select: { title: true, maxAttempts: true } },
      user: { select: { name: true } },
    },
  });
  if (!attempt) throw notFound("Attempt");

  if (attempt.status === AttemptStatus.VOIDED) throw conflict("This attempt has already been voided.");

  const standing = standingOf(actor);

  // A marked attempt is the common case, not an edge case: force-submitting an
  // objective paper auto-grades it within seconds, so an exam broken by a dead
  // machine is usually already GRADED by the time anyone asks to restart it.
  //
  // What does need care is a result the candidate has already seen. Restarting
  // withdraws it, which is a decision for an exam officer, not for whoever is on
  // the floor.
  const withdrawsReleasedResult = attempt.status === AttemptStatus.GRADED && attempt.releasedAt !== null;
  if (withdrawsReleasedResult && !standing.canManageExams) {
    throw forbidden(
      "This result has already been released to the candidate. An exam officer or an administrator can restart it, which withdraws the result.",
    );
  }

  const [{ policy }, restartsUsed] = await Promise.all([
    examDayPolicy(actor.orgId),
    prisma.attempt.count({
      where: { examId: attempt.examId, userId: attempt.userId, status: AttemptStatus.VOIDED },
    }),
  ]);

  const decision = canRestartAttempt(policy, standing, restartsUsed);
  if (!decision.ok) throw forbidden(decision.reason);

  await prisma.$transaction(async (tx) => {
    await tx.attempt.update({
      where: { id: attemptId },
      data: { status: AttemptStatus.VOIDED, releasedAt: null },
    });
    await tx.proctorEvent.create({
      data: {
        attemptId,
        type: "attempt.restarted",
        severity: "HIGH",
        payload: {
          by: actor.userId,
          reason: input.reason,
          previousStatus: attempt.status,
          withdrewReleasedResult: withdrawsReleasedResult,
        },
      },
    });
    await audit(
      {
        actor,
        action: "attempt.restart",
        entityType: "attempt",
        entityId: attemptId,
        before: { status: attempt.status },
        after: {
          status: AttemptStatus.VOIDED,
          reason: input.reason,
          restartsUsed: restartsUsed + 1,
          withdrewReleasedResult: withdrawsReleasedResult,
        },
      },
      tx,
    );
  });

  // Nothing is left to auto-submit on a voided attempt.
  await scheduleAutoSubmit(attemptId, null, 0);

  return {
    voidedAttemptId: attemptId,
    candidate: attempt.user.name,
    exam: attempt.exam.title,
    restartsUsed: restartsUsed + 1,
    restartsAllowed: policy.maxRestartsPerCandidate,
    /** True when a result the candidate could already see was taken back. */
    withdrewReleasedResult: withdrawsReleasedResult,
  };
}
