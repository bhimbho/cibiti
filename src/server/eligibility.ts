import { ExamStatus, type Prisma } from "@prisma/client";

/**
 * Published exams a candidate may sit.
 * - No assignments and no course: open to every candidate in the organisation.
 * - No assignments but linked to a course: candidates registered on that course.
 * - Assignments: the candidate is assigned directly, through a course, or through a group/arm.
 */
export function eligibleExamsWhere(userId: string, orgId: string): Prisma.ExamWhereInput {
  const enrolled = { enrollments: { some: { userId } } };
  return {
    orgId,
    status: ExamStatus.PUBLISHED,
    deletedAt: null,
    OR: [
      { assignments: { none: {} }, courseId: null },
      { assignments: { none: {} }, course: enrolled },
      { assignments: { some: { OR: [{ userId }, { course: enrolled }, { group: { members: { some: { userId } } } }] } } },
    ],
  };
}
