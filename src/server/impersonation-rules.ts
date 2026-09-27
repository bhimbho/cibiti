import { ImpersonationMode } from "@prisma/client";

/**
 * What a write is allowed to do while an administrator is viewing as someone else.
 * Pure, and in its own module, so the rule can be tested exhaustively and read
 * without the surrounding request machinery.
 */

/** Routes that must keep working so a view can always be ended. */
const ALWAYS_ALLOWED = ["/api/impersonation"];

/**
 * The endpoints a candidate's own paper is written through: answering, submitting,
 * resuming, and the integrity events beside them. Acting here means taking the exam
 * for somebody, so it stays off unless an administrator deliberately allows it for
 * testing — and any attempt touched that way is marked as not the candidate's work.
 */
const EXAM_ACTIONS = [
  /^\/api\/attempts\/[^/]+\/responses/,
  /^\/api\/attempts\/[^/]+\/submit/,
  /^\/api\/attempts\/[^/]+\/resume/,
  /^\/api\/attempts\/[^/]+\/events/,
];

export type WriteDecision = { ok: true } | { ok: false; reason: string };

/** True for the endpoints that constitute sitting an exam. */
export function isExamAction(path: string): boolean {
  return EXAM_ACTIONS.some((pattern) => pattern.test(path));
}

/** The attempt a request acts on, for marking it as staff-assisted. */
export function attemptIdFromPath(path: string): string | null {
  return /^\/api\/attempts\/([^/]+)\//.exec(path)?.[1] ?? null;
}

export function isReadMethod(method: string): boolean {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/**
 * Whether a mutating request may proceed while viewing as `targetName`.
 * `mode` is the organisation's setting; the path decides the exceptions.
 */
export function canWriteWhileViewing(
  mode: ImpersonationMode,
  path: string,
  targetName: string,
  allowExamActions = false,
): WriteDecision {
  if (ALWAYS_ALLOWED.some((allowed) => path.startsWith(allowed))) return { ok: true };

  if (isExamAction(path)) {
    // Both switches, not one: editing as a user is a support tool, answering their
    // exam is a testing tool, and conflating them is how a test submission ends up
    // in a real cohort.
    if (mode === ImpersonationMode.EDIT && allowExamActions) return { ok: true };
    return {
      ok: false,
      reason: `Answering or submitting an exam as ${targetName} is switched off. An administrator can allow it in Settings for testing — attempts made that way are marked as staff-assisted. Otherwise use the invigilation console to add time, restart or submit their attempt as yourself.`,
    };
  }

  if (mode === ImpersonationMode.READ_ONLY) {
    return {
      ok: false,
      reason: `You are viewing the app as ${targetName}, which is read-only. An administrator can allow editing in Settings, or stop viewing as them to make changes as yourself.`,
    };
  }

  return { ok: true };
}
