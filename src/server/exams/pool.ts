import { QuestionStatus, type Difficulty, type Prisma } from "@prisma/client";

export type PoolRule = { subjectId: string | null; topicId: string | null; difficulty: Difficulty | null; tagId: string | null };

/** Approved questions a random-draw rule may pick from. Shared by delivery and publish checks. */
export function poolWhere(orgId: string, rule: PoolRule, excludeQuestionIds: string[]): Prisma.QuestionWhereInput {
  return {
    orgId,
    status: QuestionStatus.APPROVED,
    deletedAt: null,
    id: { notIn: excludeQuestionIds },
    currentVersion: {
      is: {
        ...(rule.subjectId ? { subjectId: rule.subjectId } : {}),
        ...(rule.topicId ? { topicId: rule.topicId } : {}),
        ...(rule.difficulty ? { difficulty: rule.difficulty } : {}),
      },
    },
    ...(rule.tagId ? { tags: { some: { tagId: rule.tagId } } } : {}),
  };
}
