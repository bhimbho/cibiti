import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { canAnywhere, type Actor } from "../authz";
import { badRequest, forbidden } from "../http";
import { DEFAULT_BANDS, scaleProblems, sortBands, type Band } from "./scale";

export const gradeScaleSchema = z.object({
  bands: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(4),
        minPercent: z.number().int().min(0).max(100),
        gradePoint: z.number().min(0).max(10),
      }),
    )
    .min(1)
    .max(15),
});
export type GradeScaleInput = z.infer<typeof gradeScaleSchema>;

/**
 * The organisation's scale, falling back to the default until one is saved. The
 * fallback is returned rather than an empty list so every screen has bands to
 * grade with on day one.
 */
export async function gradeBands(orgId: string): Promise<{ bands: Band[]; isDefault: boolean }> {
  const rows = await prisma.gradeBand.findMany({
    where: { orgId },
    orderBy: { minPercent: "desc" },
    select: { label: true, minPercent: true, gradePoint: true },
  });
  return rows.length > 0 ? { bands: rows, isDefault: false } : { bands: DEFAULT_BANDS, isDefault: true };
}

/** Replaces the scale wholesale: bands are a set, and editing them one row at a
 *  time would leave the scale invalid between requests. */
export async function setGradeBands(actor: Actor, input: GradeScaleInput) {
  if (!canAnywhere(actor, "org:manage")) throw forbidden("Only administrators can change the grading scale.");
  const problems = scaleProblems(input.bands);
  if (problems.length > 0) throw badRequest(problems.join(" "), { problems });

  const before = await prisma.gradeBand.findMany({
    where: { orgId: actor.orgId },
    orderBy: { minPercent: "desc" },
    select: { label: true, minPercent: true, gradePoint: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.gradeBand.deleteMany({ where: { orgId: actor.orgId } });
    await tx.gradeBand.createMany({
      data: sortBands(input.bands).map((band) => ({ ...band, label: band.label.trim(), orgId: actor.orgId })),
    });
    await audit(
      { actor, action: "grade-scale.set", entityType: "organization", entityId: actor.orgId, before: { bands: before }, after: { bands: input.bands } },
      tx,
    );
  });

  return gradeBands(actor.orgId);
}
