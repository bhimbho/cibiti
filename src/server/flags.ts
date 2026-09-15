import { prisma } from "@/lib/prisma";

// Features that ship fully built but dormant. Every flag defaults to off (PLAN.md §8, §5.4).
export const FLAGS = {
  proctoring: "proctoring",
  aiAssist: "ai-assist",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

export const flagCatalog: Record<FlagKey, { label: string; description: string }> = {
  proctoring: {
    label: "Exam integrity controls",
    description: "Allow exams to use integrity levels above L0 (warnings, lockdown actions, webcam checks, live invigilation).",
  },
  "ai-assist": {
    label: "AI assist (Claude)",
    description: "Question generation, scanned past-question import, and grading suggestions. Requires internet on the server.",
  },
};

/** An exam-level row overrides the org-level row; with neither, the flag is off. */
export async function isFlagEnabled(orgId: string, key: FlagKey, examId?: string): Promise<boolean> {
  const rows = await prisma.featureFlag.findMany({
    where: { orgId, key, OR: [{ examId: null }, ...(examId ? [{ examId }] : [])] },
    select: { examId: true, enabled: true },
  });
  const examRow = examId ? rows.find((r) => r.examId === examId) : undefined;
  const orgRow = rows.find((r) => r.examId === null);
  return examRow?.enabled ?? orgRow?.enabled ?? false;
}

/**
 * The integrity level an exam actually runs at. Exams can store a higher level while
 * proctoring is disabled for the organisation; delivery then falls back to L0 (passive logging).
 */
export async function effectiveIntegrityLevel(orgId: string, examId: string, configuredLevel: number): Promise<number> {
  if (configuredLevel <= 0) return 0;
  return (await isFlagEnabled(orgId, FLAGS.proctoring, examId)) ? configuredLevel : 0;
}
