import { AttemptStatus, Prisma, SubmissionType } from "@prisma/client";
import { poolWhere } from "../exams/pool";
import { prisma } from "@/lib/prisma";
import { candidateView, createLayout, getItemType, parseResponse } from "@/items/registry";
import { shuffleInPlace } from "@/items/shared";
import type { Actor } from "../authz";
import { conflict, forbidden, HttpError, notFound, toJson } from "../http";
import { effectiveIntegrityLevel } from "../flags";
import { eligibleExamsWhere } from "../eligibility";
import { scheduleAutoSubmit } from "../queue";
import { computeDeadline, isPastDeadline, SUBMIT_GRACE_MS } from "./deadline";
import { finalizeAttempt } from "./grading";

export type ClientContext = { deviceId: string; ip: string | null; userAgent: string | null };

const attemptClosed = (status: AttemptStatus) => new HttpError(409, "This attempt has already been submitted.", { code: "ATTEMPT_CLOSED", status });
const deviceLocked = () =>
  new HttpError(409, "This exam is open on another computer. Ask an invigilator to move it to this one.", { code: "DEVICE_LOCKED" });

// ─────────────── Eligibility ───────────────

async function assertEligible(actor: Actor, examId: string) {
  const eligible = await prisma.exam.count({ where: { id: examId, ...eligibleExamsWhere(actor.userId, actor.orgId) } });
  if (!eligible) throw forbidden("This exam has not been assigned to you.");
}

async function resolveSession(examId: string, accessCode: string | undefined, ip: string | null, now: Date) {
  const sessions = await prisma.examSession.findMany({ where: { examId }, orderBy: { startsAt: "asc" } });
  if (sessions.length === 0) return null;

  const open = sessions.filter((s) => {
    const lateLimit = s.lateJoinMin != null ? s.startsAt.getTime() + s.lateJoinMin * 60_000 : s.endsAt.getTime();
    return now >= s.startsAt && now.getTime() <= Math.min(lateLimit, s.endsAt.getTime());
  });
  if (open.length === 0) {
    const next = sessions.find((s) => s.startsAt > now);
    throw forbidden(next ? `This exam opens at ${next.startsAt.toISOString()}.` : "There is no open sitting for this exam.");
  }

  const session = open.find((s) => !s.accessCode || s.accessCode === accessCode);
  if (!session) throw new HttpError(403, "Enter the access code for this sitting.", { code: "ACCESS_CODE_REQUIRED" });
  if (session.ipAllowlist.length && (!ip || !session.ipAllowlist.includes(ip))) {
    throw forbidden("This exam can only be taken from an approved computer lab.");
  }
  return session;
}

// ─────────────── Item selection ───────────────

type PlannedItem = { sectionId: string; questionId: string; versionId: string; type: string; interaction: unknown; points: number };

async function planItems(
  orgId: string,
  sections: Prisma.SectionGetPayload<{ include: { items: { include: { version: true } }; rules: true } }>[],
  shuffleQuestions: boolean,
): Promise<PlannedItem[]> {
  const planned: PlannedItem[] = [];
  const used = new Set<string>();

  for (const section of sections) {
    const sectionItems: PlannedItem[] = section.items
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ sectionId: section.id, questionId: item.questionId, versionId: item.versionId, type: item.version.type, interaction: item.version.interaction, points: item.points }));
    sectionItems.forEach((i) => used.add(i.questionId));

    for (const rule of section.rules) {
      const pool = await prisma.question.findMany({
        where: poolWhere(orgId, rule, [...used]),
        select: { id: true, currentVersion: { select: { id: true, type: true, interaction: true } } },
      });
      for (const question of shuffleInPlace(pool, Math.random).slice(0, rule.count)) {
        if (!question.currentVersion) continue;
        used.add(question.id);
        sectionItems.push({ sectionId: section.id, questionId: question.id, versionId: question.currentVersion.id, type: question.currentVersion.type, interaction: question.currentVersion.interaction, points: rule.points });
      }
    }

    planned.push(...(shuffleQuestions ? shuffleInPlace(sectionItems, Math.random) : sectionItems));
  }
  return planned;
}

// ─────────────── Start / resume ───────────────

export async function startOrResumeAttempt(actor: Actor, examId: string, client: ClientContext, accessCode?: string) {
  const now = new Date();
  const exam = await prisma.exam.findFirst({
    where: { id: examId, orgId: actor.orgId, deletedAt: null },
    include: { sections: { orderBy: { order: "asc" }, include: { items: { include: { version: true } }, rules: true } } },
  });
  if (!exam || exam.status !== "PUBLISHED") throw notFound("Exam");

  const existing = await prisma.attempt.findFirst({ where: { examId, userId: actor.userId, status: AttemptStatus.IN_PROGRESS } });
  if (existing) return resumeAttempt(actor, existing.id, client);

  await assertEligible(actor, exam.id);
  const session = await resolveSession(examId, accessCode, client.ip, now);

  const planned = await planItems(actor.orgId, exam.sections, exam.shuffleQuestions);
  if (planned.length === 0) throw conflict("This exam has no questions yet.");

  const accommodation = await prisma.accommodation.findFirst({
    where: { userId: actor.userId, OR: [{ examId }, { examId: null }] },
    orderBy: { examId: { sort: "desc", nulls: "last" } },
  });

  const attemptId = await prisma.$transaction(async (tx) => {
    // Serialise starts per candidate+exam so a double click cannot create two attempts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${examId}:${actor.userId}`}))`;

    const open = await tx.attempt.findFirst({ where: { examId, userId: actor.userId, status: AttemptStatus.IN_PROGRESS }, select: { id: true } });
    if (open) return open.id;

    const used = await tx.attempt.count({ where: { examId, userId: actor.userId, status: { not: AttemptStatus.VOIDED } } });
    if (used >= exam.maxAttempts) throw forbidden("You have used all your attempts for this exam.");
    const last = await tx.attempt.aggregate({ where: { examId, userId: actor.userId }, _max: { attemptNo: true } });

    const created = await tx.attempt.create({
      data: {
        examId,
        userId: actor.userId,
        sessionId: session?.id,
        attemptNo: (last._max.attemptNo ?? 0) + 1,
        startedAt: now,
        deadlineAt: computeDeadline({ startedAt: now, timeLimitMin: exam.timeLimitMin, extraTimePct: accommodation?.extraTimePct ?? 0, extensionSec: 0, sessionEndsAt: session?.endsAt ?? null }),
        maxScore: planned.reduce((sum, p) => sum + p.points, 0),
        activeDeviceId: client.deviceId,
        ipAddress: client.ip,
        userAgent: client.userAgent,
        lastSeenAt: now,
        items: {
          create: planned.map((p, order) => ({
            order,
            sectionId: p.sectionId,
            questionId: p.questionId,
            versionId: p.versionId,
            points: p.points,
            layout: toJson(createLayout(p.type, p.interaction, exam.shuffleOptions)) as Prisma.InputJsonValue,
          })),
        },
        events: { create: { type: "attempt.started", severity: "INFO", payload: { ip: client.ip, userAgent: client.userAgent } } },
      },
    });
    return created.id;
  });

  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { deadlineAt: true } });
  await scheduleAutoSubmit(attemptId, attempt.deadlineAt, SUBMIT_GRACE_MS);
  return getCandidateState(actor, attemptId);
}

export async function resumeAttempt(actor: Actor, attemptId: string, client: ClientContext) {
  const attempt = await loadOwnAttempt(actor, attemptId);
  if (attempt.status !== AttemptStatus.IN_PROGRESS) return getCandidateState(actor, attemptId);

  if (attempt.activeDeviceId && attempt.activeDeviceId !== client.deviceId) {
    await prisma.proctorEvent.create({ data: { attemptId, type: "device.conflict", severity: "MEDIUM", payload: { ip: client.ip, userAgent: client.userAgent } } });
    throw deviceLocked();
  }

  if (isPastDeadline(attempt.deadlineAt, new Date())) {
    await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, SubmissionType.TIME_EXPIRED));
    return getCandidateState(actor, attemptId);
  }

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      activeDeviceId: client.deviceId,
      lastSeenAt: new Date(),
      events: { create: { type: "attempt.resumed", severity: "INFO", payload: { ip: client.ip } } },
    },
  });
  return getCandidateState(actor, attemptId);
}

async function loadOwnAttempt(actor: Actor, attemptId: string) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== actor.userId) throw notFound("Attempt");
  return attempt;
}

// ─────────────── Candidate state ───────────────

export async function getCandidateState(actor: Actor, attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { include: { sections: { orderBy: { order: "asc" }, select: { id: true, title: true, instructions: true } } } },
      items: { orderBy: { order: "asc" }, include: { version: true, response: true } },
    },
  });
  if (!attempt || attempt.userId !== actor.userId) throw notFound("Attempt");

  const base = {
    id: attempt.id,
    status: attempt.status,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    serverNow: new Date().toISOString(),
  };

  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    const released = Boolean(attempt.releasedAt);
    return {
      ...base,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submissionType: attempt.submissionType,
      result: released ? { score: attempt.score, maxScore: attempt.maxScore, percent: attempt.percent, passed: attempt.passed } : null,
      awaitingGrading: attempt.status === AttemptStatus.SUBMITTED,
    };
  }

  return {
    ...base,
    instructions: attempt.exam.instructions,
    navigation: attempt.exam.navigation,
    deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
    integrityLevel: await effectiveIntegrityLevel(attempt.exam.orgId, attempt.examId, attempt.exam.integrityLevel),
    sections: attempt.exam.sections,
    items: attempt.items.map((item) => ({
      id: item.id,
      order: item.order,
      sectionId: item.sectionId,
      type: item.version.type,
      content: item.version.content,
      view: candidateView(item.version.type, item.version.interaction, item.layout),
      points: item.points,
      response: item.response ? { value: item.response.value, revision: item.response.revision, flagged: item.response.flagged, timeSpentMs: item.response.timeSpentMs } : null,
    })),
  };
}

// ─────────────── Autosave ───────────────

export type ResponseWrite = { itemId: string; value: unknown; flagged?: boolean; revision: number; timeSpentMs?: number };

async function assertWritable(attemptId: string, attempt: { status: AttemptStatus; activeDeviceId: string | null; deadlineAt: Date | null }, deviceId: string) {
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw attemptClosed(attempt.status);
  if (attempt.activeDeviceId && attempt.activeDeviceId !== deviceId) throw deviceLocked();
  if (isPastDeadline(attempt.deadlineAt, new Date())) {
    const { status } = await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, SubmissionType.TIME_EXPIRED));
    throw attemptClosed(status);
  }
}

export async function saveResponses(actor: Actor, attemptId: string, deviceId: string, writes: ResponseWrite[]) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { items: { select: { id: true, version: { select: { type: true } }, response: true } } },
  });
  if (!attempt || attempt.userId !== actor.userId) throw notFound("Attempt");
  await assertWritable(attemptId, attempt, deviceId);

  const items = new Map(attempt.items.map((i) => [i.id, i]));
  const saved: { itemId: string; revision: number }[] = [];
  const rejected: { itemId: string; reason: string }[] = [];
  const now = new Date();

  for (const write of writes) {
    const item = items.get(write.itemId);
    if (!item) {
      rejected.push({ itemId: write.itemId, reason: "unknown-item" });
      continue;
    }
    const value = parseResponse(item.version.type, write.value);
    if (write.value !== null && value === null) {
      rejected.push({ itemId: write.itemId, reason: "invalid-response" });
      continue;
    }

    const existing = item.response;
    if (existing && existing.revision >= write.revision) {
      // Stale or duplicate write (retries, out-of-order delivery). The newer server copy wins.
      saved.push({ itemId: write.itemId, revision: existing.revision });
      continue;
    }

    const valueJson = value === null ? Prisma.JsonNull : (toJson(value) as Prisma.InputJsonValue);
    const changed = JSON.stringify(existing?.value ?? null) !== JSON.stringify(value);
    const data = {
      value: valueJson,
      revision: write.revision,
      flagged: write.flagged ?? existing?.flagged ?? false,
      timeSpentMs: Math.max(existing?.timeSpentMs ?? 0, Math.min(write.timeSpentMs ?? 0, 24 * 3600_000)),
      savedAt: now,
    };

    if (existing) {
      // The revision guard makes concurrent writes safe without a row lock.
      const { count } = await prisma.response.updateMany({
        where: { attemptItemId: item.id, revision: { lt: write.revision } },
        data: { ...data, changeCount: changed ? { increment: 1 } : undefined },
      });
      if (count === 0) {
        const current = await prisma.response.findUnique({ where: { attemptItemId: item.id }, select: { revision: true } });
        saved.push({ itemId: write.itemId, revision: current?.revision ?? write.revision });
        continue;
      }
    } else {
      try {
        await prisma.response.create({ data: { attemptItemId: item.id, ...data, changeCount: value === null ? 0 : 1 } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        await prisma.response.updateMany({ where: { attemptItemId: item.id, revision: { lt: write.revision } }, data });
      }
    }
    saved.push({ itemId: write.itemId, revision: write.revision });
  }

  const updated = await prisma.attempt.update({ where: { id: attemptId }, data: { lastSeenAt: now }, select: { deadlineAt: true } });
  return { saved, rejected, deadlineAt: updated.deadlineAt?.toISOString() ?? null, serverNow: now.toISOString() };
}

// ─────────────── Events ───────────────

const eventSeverity: Record<string, "INFO" | "LOW" | "MEDIUM" | "HIGH"> = {
  "focus.lost": "LOW",
  "focus.returned": "INFO",
  "visibility.hidden": "LOW",
  "visibility.visible": "INFO",
  "fullscreen.exited": "MEDIUM",
  "fullscreen.entered": "INFO",
  "clipboard.copy": "MEDIUM",
  "clipboard.paste": "MEDIUM",
  "clipboard.cut": "MEDIUM",
  "contextmenu.opened": "LOW",
  "network.offline": "INFO",
  "network.online": "INFO",
  "screen.extended": "HIGH",
  "print.attempted": "MEDIUM",
};

export const recordableEventTypes = Object.keys(eventSeverity) as [string, ...string[]];

export type ClientEvent = { type: string; clientAt?: string; payload?: Record<string, unknown> };

/** Integrity events are always stored (passive logging), whatever the exam's integrity level. */
export async function recordEvents(actor: Actor, attemptId: string, deviceId: string, events: ClientEvent[]) {
  const attempt = await loadOwnAttempt(actor, attemptId);
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw attemptClosed(attempt.status);
  if (attempt.activeDeviceId && attempt.activeDeviceId !== deviceId) throw deviceLocked();

  await prisma.proctorEvent.createMany({
    data: events.map((event) => ({
      attemptId,
      type: event.type,
      severity: eventSeverity[event.type] ?? "INFO",
      clientAt: event.clientAt ? new Date(event.clientAt) : null,
      payload: event.payload ? (toJson(event.payload) as Prisma.InputJsonValue) : undefined,
    })),
  });
  return { recorded: events.length };
}

// ─────────────── Submit ───────────────

export async function submitAttempt(actor: Actor, attemptId: string, deviceId: string) {
  const attempt = await loadOwnAttempt(actor, attemptId);
  if (attempt.status !== AttemptStatus.IN_PROGRESS) return getCandidateState(actor, attemptId);
  if (attempt.activeDeviceId && attempt.activeDeviceId !== deviceId) throw deviceLocked();

  const type = isPastDeadline(attempt.deadlineAt, new Date()) ? SubmissionType.TIME_EXPIRED : SubmissionType.CANDIDATE;
  await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, type));
  await scheduleAutoSubmit(attemptId, null, 0);
  return getCandidateState(actor, attemptId);
}

/** Used by the worker. Closes every attempt whose deadline plus grace has passed. */
export async function sweepExpiredAttempts(now = new Date()): Promise<number> {
  const expired = await prisma.attempt.findMany({
    where: { status: AttemptStatus.IN_PROGRESS, deadlineAt: { lt: new Date(now.getTime() - SUBMIT_GRACE_MS) } },
    select: { id: true },
    take: 500,
  });
  for (const { id } of expired) {
    await prisma.$transaction((tx) => finalizeAttempt(tx, id, SubmissionType.TIME_EXPIRED, now));
  }
  return expired.length;
}

export async function autoSubmitIfExpired(attemptId: string): Promise<boolean> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, select: { status: true, deadlineAt: true } });
  if (!attempt || attempt.status !== AttemptStatus.IN_PROGRESS) return false;
  if (!isPastDeadline(attempt.deadlineAt, new Date(), SUBMIT_GRACE_MS - 1000)) {
    // Deadline moved (time extension) after this job was queued; reschedule.
    await scheduleAutoSubmit(attemptId, attempt.deadlineAt, SUBMIT_GRACE_MS);
    return false;
  }
  await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, SubmissionType.TIME_EXPIRED));
  return true;
}

export function assertKnownType(type: string) {
  getItemType(type);
}
