// Grace period for answers that were in flight when time ran out (slow LAN, busy server).
export const SUBMIT_GRACE_MS = 30_000;

export type DeadlineInput = {
  startedAt: Date;
  timeLimitMin: number | null;
  extraTimePct: number;
  extensionSec: number;
  sessionEndsAt: Date | null;
};

/**
 * The single source of truth for when an attempt ends. Null means untimed with no sitting window.
 * Accommodations stretch the time limit; invigilator extensions add on top.
 * A sitting's end time caps everything except invigilator extensions, which exist to cover outages.
 */
export function computeDeadline({ startedAt, timeLimitMin, extraTimePct, extensionSec, sessionEndsAt }: DeadlineInput): Date | null {
  const extensionMs = extensionSec * 1000;
  const candidates: number[] = [];
  if (timeLimitMin) candidates.push(startedAt.getTime() + timeLimitMin * 60_000 * (1 + extraTimePct / 100));
  if (sessionEndsAt) candidates.push(sessionEndsAt.getTime());
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates) + extensionMs);
}

export function isPastDeadline(deadlineAt: Date | null, now: Date, graceMs = SUBMIT_GRACE_MS): boolean {
  return deadlineAt !== null && now.getTime() > deadlineAt.getTime() + graceMs;
}
