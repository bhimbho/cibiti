import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { canAnywhere, type Actor } from "../authz";
import { badRequest, forbidden } from "../http";
import { DEFAULT_EXAM_DAY_POLICY, policyProblems, type ExamDayPolicy, type Standing } from "./policy";

export const examDayPolicySchema = z.object({
  allowRestart: z.boolean(),
  invigilatorCanRestart: z.boolean(),
  maxRestartsPerCandidate: z.number().int().min(1).max(10),
  invigilatorCanExtend: z.boolean(),
  maxExtraMinutesPerAttempt: z.number().int().min(0).max(480),
});

/** The organisation's policy, or the safe default until one is saved. */
export async function examDayPolicy(orgId: string): Promise<{ policy: ExamDayPolicy; isDefault: boolean }> {
  const row = await prisma.examDayPolicy.findUnique({
    where: { orgId },
    select: {
      allowRestart: true,
      invigilatorCanRestart: true,
      maxRestartsPerCandidate: true,
      invigilatorCanExtend: true,
      maxExtraMinutesPerAttempt: true,
    },
  });
  return row ? { policy: row, isDefault: false } : { policy: DEFAULT_EXAM_DAY_POLICY, isDefault: true };
}

export async function setExamDayPolicy(actor: Actor, input: ExamDayPolicy) {
  if (!canAnywhere(actor, "org:manage")) throw forbidden("Only administrators can change exam-day policy.");
  const problems = policyProblems(input);
  if (problems.length > 0) throw badRequest(problems.join(" "), { problems });

  const before = await examDayPolicy(actor.orgId);
  await prisma.$transaction(async (tx) => {
    await tx.examDayPolicy.upsert({ where: { orgId: actor.orgId }, create: { orgId: actor.orgId, ...input }, update: input });
    await audit(
      { actor, action: "exam-day-policy.set", entityType: "organization", entityId: actor.orgId, before: before.policy, after: input },
      tx,
    );
  });
  return examDayPolicy(actor.orgId);
}

/**
 * Whether this actor could restart *something* — role plus policy, ignoring any
 * particular attempt. Screens use it to decide whether to offer the action at all;
 * the attempt's own state and the restart count are checked when it is used.
 */
export function mayRestartAtAll(actor: Actor, policy: ExamDayPolicy): boolean {
  if (!policy.allowRestart) return false;
  const standing = standingOf(actor);
  if (standing.canManageExams) return true;
  return standing.canInvigilate && policy.invigilatorCanRestart;
}

/** What the actor may do on the exam floor, in the terms the policy is written in. */
export function standingOf(actor: Actor): Standing {
  return {
    // Restarting and extending are exam operations, so exam:publish is the mark of
    // someone senior enough to do them regardless of the invigilator switches.
    canManageExams: canAnywhere(actor, "exam:publish"),
    canInvigilate: canAnywhere(actor, "invigilate"),
  };
}
