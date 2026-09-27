import { ImpersonationMode } from "@prisma/client";

/**
 * What a write is allowed to do while an administrator is viewing as someone else.
 * Pure, and in its own module, so the rule can be tested exhaustively and read
 * without the surrounding request machinery.
 */

/** Routes that must keep working so a view can always be ended. */
const ALWAYS_ALLOWED = ["/api/impersonation"];

/**
 * Sitting an exam is never impersonable, in either mode. These are the endpoints a
 * candidate's own paper is written through: answering, submitting, resuming, and the
 * integrity events that accompany them. An administrator acting here would be taking
 * the exam for them, which no setting should be able to permit — and which would
 * leave a submission the candidate never made.
 */
const NEVER_ALLOWED = [
  /^\/api\/attempts\/[^/]+\/responses/,
  /^\/api\/attempts\/[^/]+\/submit/,
  /^\/api\/attempts\/[^/]+\/resume/,
  /^\/api\/attempts\/[^/]+\/events/,
];

export type WriteDecision = { ok: true } | { ok: false; reason: string };

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
): WriteDecision {
  if (ALWAYS_ALLOWED.some((allowed) => path.startsWith(allowed))) return { ok: true };

  if (NEVER_ALLOWED.some((pattern) => pattern.test(path))) {
    return {
      ok: false,
      reason: `Sitting an exam as ${targetName} is never permitted. Use the invigilation console to add time, restart or submit their attempt as yourself.`,
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
