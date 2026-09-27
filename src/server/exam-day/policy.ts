/**
 * Who may rescue a candidate's exam, and how far. Pure decisions, separated from
 * the queries, because they are the rules an institution argues about: a restart
 * destroys a candidate's work, and extra time changes the exam everyone else sat.
 */

export type ExamDayPolicy = {
  allowRestart: boolean;
  invigilatorCanRestart: boolean;
  maxRestartsPerCandidate: number;
  invigilatorCanExtend: boolean;
  maxExtraMinutesPerAttempt: number;
};

/** Safe by default: time can be added, nothing can be destroyed, until configured. */
export const DEFAULT_EXAM_DAY_POLICY: ExamDayPolicy = {
  allowRestart: false,
  invigilatorCanRestart: false,
  maxRestartsPerCandidate: 1,
  invigilatorCanExtend: true,
  maxExtraMinutesPerAttempt: 60,
};

/**
 * What the actor is, for these decisions. An invigilator is the constrained case:
 * they are on the exam floor, often a junior member of staff, and the policy exists
 * mostly to bound what they can do unsupervised.
 */
export type Standing = { canManageExams: boolean; canInvigilate: boolean };

export type Decision = { ok: true } | { ok: false; reason: string };

const ok: Decision = { ok: true };
const no = (reason: string): Decision => ({ ok: false, reason });

/**
 * Whether this actor may restart an attempt. `restartsUsed` counts the candidate's
 * already-voided attempts at this exam, so a second mishap does not become an
 * unlimited supply of fresh papers.
 */
export function canRestartAttempt(
  policy: ExamDayPolicy,
  standing: Standing,
  restartsUsed: number,
): Decision {
  if (!policy.allowRestart) {
    return no("Restarting exams is switched off for this organisation. An administrator can turn it on in Settings.");
  }
  if (!standing.canManageExams && !standing.canInvigilate) {
    return no("You don't have permission to restart an exam.");
  }
  if (!standing.canManageExams && !policy.invigilatorCanRestart) {
    return no("Invigilators cannot restart exams here. Ask an exam officer or an administrator.");
  }
  if (restartsUsed >= policy.maxRestartsPerCandidate) {
    return no(
      `This candidate has already been restarted ${restartsUsed} time${restartsUsed === 1 ? "" : "s"} on this exam, which is the limit.`,
    );
  }
  return ok;
}

/**
 * Whether this actor may add `minutes` to an attempt that already carries
 * `alreadyAddedMinutes`. The cap is per attempt, not per grant, or repeated small
 * extensions would walk straight past it.
 */
export function canExtendAttempt(
  policy: ExamDayPolicy,
  standing: Standing,
  alreadyAddedMinutes: number,
  minutes: number,
): Decision {
  if (!standing.canManageExams && !standing.canInvigilate) {
    return no("You don't have permission to add time.");
  }
  if (!standing.canManageExams && !policy.invigilatorCanExtend) {
    return no("Invigilators cannot add time here. Ask an exam officer or an administrator.");
  }
  if (policy.maxExtraMinutesPerAttempt <= 0) {
    return no("Adding time is switched off for this organisation.");
  }
  const total = alreadyAddedMinutes + minutes;
  if (total > policy.maxExtraMinutesPerAttempt) {
    const left = Math.max(0, policy.maxExtraMinutesPerAttempt - alreadyAddedMinutes);
    return no(
      left === 0
        ? `This attempt already has the maximum ${policy.maxExtraMinutesPerAttempt} minutes of added time.`
        : `That would add ${total} minutes in total; the limit is ${policy.maxExtraMinutesPerAttempt}. You can add ${left} more.`,
    );
  }
  return ok;
}

/** Problems worth refusing a policy over, before it is saved. */
export function policyProblems(policy: ExamDayPolicy): string[] {
  const problems: string[] = [];
  if (policy.maxRestartsPerCandidate < 1) problems.push("Allow at least one restart, or switch restarting off.");
  if (policy.maxRestartsPerCandidate > 10) problems.push("Ten restarts per candidate is the most that can be allowed.");
  if (policy.maxExtraMinutesPerAttempt < 0) problems.push("Added time cannot be negative.");
  if (policy.maxExtraMinutesPerAttempt > 480) problems.push("Eight hours is the most added time that can be allowed.");
  if (policy.invigilatorCanRestart && !policy.allowRestart) {
    problems.push("Restarting is switched off, so allowing invigilators to restart would have no effect.");
  }
  return problems;
}
