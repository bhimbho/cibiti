import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "../audit";
import { canAnywhere, type Actor } from "../authz";
import { badRequest, forbidden, notFound } from "../http";

/**
 * A course's assessment components: the continuous assessment and the exam that
 * together make up a final mark, each carrying a share of it. A broadsheet is
 * meaningless without them, so they are configured per course.
 */

export const componentsSchema = z.object({
  components: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        weightPct: z.number().int().min(1).max(100),
        examId: z.string().min(1).nullish(),
      }),
    )
    .max(10),
});
export type ComponentsInput = z.infer<typeof componentsSchema>;

/** Weights must add to exactly 100: anything else silently rescales every mark. */
export function weightProblems(components: { name: string; weightPct: number }[]): string[] {
  if (components.length === 0) return [];
  const problems: string[] = [];
  const total = components.reduce((sum, c) => sum + c.weightPct, 0);
  if (total !== 100) problems.push(`Weights add up to ${total}%, not 100%.`);
  const names = new Set<string>();
  for (const component of components) {
    const key = component.name.trim().toLowerCase();
    if (names.has(key)) problems.push(`More than one component is called ${component.name}.`);
    names.add(key);
  }
  return problems;
}

export async function courseComponents(actor: Actor, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, orgId: actor.orgId },
    select: {
      id: true,
      code: true,
      title: true,
      credits: true,
      components: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, weightPct: true, examId: true },
      },
      exams: { where: { deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } },
    },
  });
  if (!course) throw notFound("Course");
  return course;
}

/** Replaces the set, like the grading scale: partial edits would leave weights
 *  that do not add up between requests. */
export async function setCourseComponents(actor: Actor, courseId: string, input: ComponentsInput) {
  if (!canAnywhere(actor, "academics:manage")) throw forbidden("Only exam officers and administrators can set course components.");
  const course = await prisma.course.findFirst({ where: { id: courseId, orgId: actor.orgId }, select: { id: true } });
  if (!course) throw notFound("Course");

  const problems = weightProblems(input.components);
  if (problems.length > 0) throw badRequest(problems.join(" "), { problems });

  // An exam from another organisation, or one not attached to this course, would
  // pull a mark in from somewhere the broadsheet does not claim to cover.
  const examIds = input.components.map((c) => c.examId).filter((id): id is string => Boolean(id));
  if (examIds.length > 0) {
    const valid = await prisma.exam.count({ where: { id: { in: examIds }, orgId: actor.orgId, courseId } });
    if (valid !== new Set(examIds).size) throw badRequest("Pick an exam that belongs to this course.");
  }

  const before = await prisma.assessmentComponent.findMany({
    where: { courseId },
    select: { name: true, weightPct: true, examId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.assessmentComponent.deleteMany({ where: { courseId } });
    if (input.components.length > 0) {
      await tx.assessmentComponent.createMany({
        data: input.components.map((c) => ({
          courseId,
          name: c.name.trim(),
          weightPct: c.weightPct,
          examId: c.examId ?? null,
        })),
      });
    }
    await audit(
      { actor, action: "course.components", entityType: "course", entityId: courseId, before: { components: before }, after: { components: input.components } },
      tx,
    );
  });

  return courseComponents(actor, courseId);
}
