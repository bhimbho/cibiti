import { AttemptStatus, EventSeverity, SubmissionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "./audit";
import type { Actor } from "./authz";
import { computeDeadline, SUBMIT_GRACE_MS } from "./attempts/deadline";
import { finalizeAttempt } from "./attempts/grading";
import { conflict, notFound } from "./http";
import { scheduleAutoSubmit } from "./queue";

export type Connection = "online" | "idle" | "offline";

export type LiveAttempt = {
  id: string;
  candidate: string;
  regNumber: string | null;
  exam: string;
  examId: string;
  sitting: string | null;
  lab: string | null;
  startedAt: string;
  deadlineAt: string | null;
  lastSeenAt: string | null;
  connection: Connection;
  answered: number;
  total: number;
  flags: number;
  extensionMin: number;
};

// Autosave and heartbeats arrive every few seconds while a candidate is working.
function connectionState(lastSeenAt: Date | null, now: Date): Connection {
  if (!lastSeenAt) return "offline";
  const age = now.getTime() - lastSeenAt.getTime();
  if (age < 45_000) return "online";
  if (age < 180_000) return "idle";
  return "offline";
}

export async function listLiveAttempts(actor: Actor, examId?: string) {
  const now = new Date();
  const attempts = await prisma.attempt.findMany({
    where: { status: AttemptStatus.IN_PROGRESS, exam: { orgId: actor.orgId }, ...(examId ? { examId } : {}) },
    orderBy: [{ exam: { title: "asc" } }, { user: { name: "asc" } }],
    take: 2000,
    include: {
      user: { select: { name: true, regNumber: true } },
      exam: { select: { id: true, title: true } },
      session: { select: { name: true, lab: { select: { name: true } } } },
      _count: { select: { items: true, events: { where: { severity: { in: [EventSeverity.MEDIUM, EventSeverity.HIGH] } } } } },
    },
  });

  const ids = attempts.map((a) => a.id);
  const answeredRows = ids.length
    ? await prisma.$queryRaw<{ attemptId: string; answered: bigint }[]>`
        SELECT ai."attemptId", COUNT(r.id) AS answered
        FROM attempt_item ai
        JOIN response r ON r."attemptItemId" = ai.id
        WHERE ai."attemptId" = ANY(${ids}) AND r.value IS NOT NULL AND r.value::text <> 'null'
        GROUP BY ai."attemptId"`
    : [];
  const answered = new Map(answeredRows.map((r) => [r.attemptId, Number(r.answered)]));

  const exams = await prisma.exam.findMany({
    where: { orgId: actor.orgId, deletedAt: null, OR: [{ status: "PUBLISHED" }, { attempts: { some: { status: AttemptStatus.IN_PROGRESS } } }] },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  const rows: LiveAttempt[] = attempts.map((a) => ({
    id: a.id,
    candidate: a.user.name,
    regNumber: a.user.regNumber,
    exam: a.exam.title,
    examId: a.exam.id,
    sitting: a.session?.name ?? null,
    lab: a.session?.lab?.name ?? null,
    startedAt: a.startedAt.toISOString(),
    deadlineAt: a.deadlineAt?.toISOString() ?? null,
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    connection: connectionState(a.lastSeenAt, now),
    answered: answered.get(a.id) ?? 0,
    total: a._count.items,
    flags: a._count.events,
    extensionMin: Math.round(a.timeExtensionSec / 60),
  }));

  return {
    rows,
    serverNow: now.toISOString(),
    exams: exams.map((e) => ({ value: e.id, label: e.title })),
    summary: {
      total: rows.length,
      online: rows.filter((r) => r.connection === "online").length,
      idle: rows.filter((r) => r.connection === "idle").length,
      offline: rows.filter((r) => r.connection === "offline").length,
      flagged: rows.filter((r) => r.flags > 0).length,
    },
  };
}

async function loadLiveAttempt(actor: Actor, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, exam: { orgId: actor.orgId } },
    include: { exam: { select: { timeLimitMin: true } }, session: { select: { endsAt: true } } },
  });
  if (!attempt) throw notFound("Attempt");
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw conflict("This attempt has already been submitted.");
  return attempt;
}

export const extendSchema = z.object({
  minutes: z.number().int().min(1, "Add at least one minute.").max(180, "Add at most 180 minutes at a time."),
  reason: z.string().trim().max(300).optional(),
});

/** Add time (e.g. after a power cut). The server deadline moves and auto-submit is rescheduled. */
export async function extendAttempt(actor: Actor, attemptId: string, input: z.infer<typeof extendSchema>) {
  const attempt = await loadLiveAttempt(actor, attemptId);
  const accommodation = await prisma.accommodation.findFirst({
    where: { userId: attempt.userId, OR: [{ examId: attempt.examId }, { examId: null }] },
    orderBy: { examId: { sort: "desc", nulls: "last" } },
  });
  const extensionSec = attempt.timeExtensionSec + input.minutes * 60;
  const deadlineAt = computeDeadline({
    startedAt: attempt.startedAt,
    timeLimitMin: attempt.exam.timeLimitMin,
    extraTimePct: accommodation?.extraTimePct ?? 0,
    extensionSec,
    sessionEndsAt: attempt.session?.endsAt ?? null,
  });
  if (!deadlineAt) throw conflict("This attempt has no time limit, so there is nothing to extend.");

  await prisma.$transaction(async (tx) => {
    await tx.attempt.update({ where: { id: attemptId }, data: { timeExtensionSec: extensionSec, deadlineAt } });
    await tx.proctorEvent.create({ data: { attemptId, type: "time.extended", severity: "INFO", payload: { minutes: input.minutes, by: actor.userId, reason: input.reason ?? null } } });
    await audit(
      {
        actor,
        action: "attempt.extend-time",
        entityType: "attempt",
        entityId: attemptId,
        before: { deadlineAt: attempt.deadlineAt?.toISOString() ?? null, timeExtensionSec: attempt.timeExtensionSec },
        after: { deadlineAt: deadlineAt.toISOString(), timeExtensionSec: extensionSec, reason: input.reason ?? null },
      },
      tx,
    );
  });
  await scheduleAutoSubmit(attemptId, deadlineAt, SUBMIT_GRACE_MS);
  return { deadlineAt: deadlineAt.toISOString() };
}

export const forceSubmitSchema = z.object({ reason: z.string().trim().min(3, "Give a short reason.").max(300) });

/** Invigilator ends an attempt now (malpractice, candidate left). It is graded like any submission. */
export async function forceSubmitAttempt(actor: Actor, attemptId: string, input: z.infer<typeof forceSubmitSchema>) {
  await loadLiveAttempt(actor, attemptId);
  const result = await prisma.$transaction(async (tx) => {
    const finalized = await finalizeAttempt(tx, attemptId, SubmissionType.INVIGILATOR);
    await tx.proctorEvent.create({ data: { attemptId, type: "attempt.force-submitted", severity: "HIGH", payload: { by: actor.userId, reason: input.reason } } });
    await audit({ actor, action: "attempt.force-submit", entityType: "attempt", entityId: attemptId, after: { reason: input.reason, status: finalized.status } }, tx);
    return finalized;
  });
  await scheduleAutoSubmit(attemptId, null, 0);
  return { status: result.status };
}
