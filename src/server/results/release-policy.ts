import { ReleasePolicy } from "@prisma/client";

/**
 * When a candidate may see their score. Pure so the rules can be tested without
 * a database, and so every caller — grading, closing an exam, the release
 * button — reads the same source.
 */

/** IMMEDIATE releases on grading, but only when nothing is left for a human to mark. */
export function releasesOnGrading(policy: ReleasePolicy, needsManualGrading: boolean): boolean {
  return policy === ReleasePolicy.IMMEDIATE && !needsManualGrading;
}

/** AFTER_CLOSE holds results back until the exam itself is closed. */
export function releasesOnClose(policy: ReleasePolicy): boolean {
  return policy === ReleasePolicy.AFTER_CLOSE;
}

/**
 * Whether staff may release results by hand. Every policy allows it except
 * NEVER, which is the point of NEVER — an exam whose scores are not a candidate's
 * to see cannot have them released by a stray click on the results table.
 */
export function allowsRelease(policy: ReleasePolicy): boolean {
  return policy !== ReleasePolicy.NEVER;
}

export const RELEASE_POLICY_LABELS: Record<ReleasePolicy, string> = {
  [ReleasePolicy.IMMEDIATE]: "As soon as the attempt is marked",
  [ReleasePolicy.AFTER_CLOSE]: "When the exam is closed",
  [ReleasePolicy.MANUAL]: "Only when staff release them",
  [ReleasePolicy.NEVER]: "Never — candidates never see scores",
};
