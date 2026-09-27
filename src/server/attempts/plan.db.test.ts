/**
 * Database-backed tests for how a candidate's paper is built: the random draw, the
 * question order and the reproducibility that the stored seed is there to provide.
 *
 * These cover `planItems` directly, because the draw is the part of delivery whose
 * fairness cannot be checked by reading the output of a single attempt.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { Difficulty, ExamStatus, OrgKind, PrismaClient, QuestionStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/random";
import { planItems } from "./engine";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `planspec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId = "";
let authorId = "";
let subjectId = "";

/** A topic of its own per test, so each test's draw pool holds only its own questions. */
async function makeTopic() {
  const topic = await prisma.topic.create({
    data: { subjectId, name: `topic-${Math.random().toString(36).slice(2, 10)}` },
    select: { id: true },
  });
  return topic.id;
}

type Sections = Parameters<typeof planItems>[1];

/** The sections shape `planItems` expects, loaded the way delivery loads it. */
async function loadSections(examId: string): Promise<Sections> {
  return prisma.section.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    include: { items: { include: { version: true } }, rules: true },
  });
}

async function makeQuestion(text: string, topicId: string, difficulty: Difficulty = Difficulty.MEDIUM) {
  const question = await prisma.question.create({
    data: { orgId, status: QuestionStatus.APPROVED, createdById: authorId },
    select: { id: true },
  });
  const version = await prisma.questionVersion.create({
    data: {
      questionId: question.id,
      version: 1,
      type: "true-false",
      content: { text, assetIds: [] },
      interaction: {},
      scoring: { correct: "true" },
      difficulty,
      points: 1,
      subjectId,
      topicId,
      createdById: authorId,
    },
    select: { id: true },
  });
  await prisma.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
  return { questionId: question.id, versionId: version.id };
}

async function makeExam(options: { shuffleQuestions?: boolean } = {}) {
  const exam = await prisma.exam.create({
    data: {
      orgId,
      title: `${stamp} ${Math.random().toString(36).slice(2, 6)}`,
      status: ExamStatus.PUBLISHED,
      authorId,
      shuffleQuestions: options.shuffleQuestions ?? false,
      publishedAt: new Date(),
      sections: { create: [{ title: "Section A", order: 0 }] },
    },
    select: { id: true, sections: { select: { id: true } } },
  });
  return { examId: exam.id, sectionId: exam.sections[0].id };
}

describe.skipIf(!hasDb)("paper planning", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: stamp, slug: stamp, kind: OrgKind.UNIVERSITY },
      select: { id: true },
    });
    orgId = org.id;
    const author = await prisma.user.create({
      data: { orgId, name: "Author", email: `${stamp}-author@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    authorId = author.id;
    const subject = await prisma.subject.create({ data: { orgId, name: `${stamp} subject`, code: "TST" }, select: { id: true } });
    subjectId = subject.id;

  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { exam: { orgId } } });
    await prisma.exam.deleteMany({ where: { orgId } });
    await prisma.question.updateMany({ where: { orgId }, data: { currentVersionId: null } });
    await prisma.questionVersion.deleteMany({ where: { question: { orgId } } });
    await prisma.question.deleteMany({ where: { orgId } });
    await prisma.topic.deleteMany({ where: { subjectId } });
    await prisma.subject.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("draws the requested number of questions from the pool", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    for (let i = 0; i < 8; i++) await makeQuestion(`${stamp} pool ${i}`, topicId);
    await prisma.selectionRule.create({ data: { sectionId, count: 3, points: 1, subjectId, topicId } });

    const planned = await planItems(orgId, await loadSections(examId), false, seededRandom("draw-three"));

    expect(planned).toHaveLength(3);
    expect(new Set(planned.map((p) => p.questionId)).size).toBe(3);
  });

  it("builds the same paper twice from the same seed", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    for (let i = 0; i < 10; i++) await makeQuestion(`${stamp} repeat ${i}`, topicId);
    await prisma.selectionRule.create({ data: { sectionId, count: 4, points: 1, subjectId, topicId } });
    const sections = await loadSections(examId);

    const first = await planItems(orgId, sections, true, seededRandom("same-seed"));
    const second = await planItems(orgId, sections, true, seededRandom("same-seed"));

    expect(first.map((p) => p.questionId)).toEqual(second.map((p) => p.questionId));
  });

  it("builds a different paper from a different seed", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    for (let i = 0; i < 12; i++) await makeQuestion(`${stamp} differ ${i}`, topicId);
    await prisma.selectionRule.create({ data: { sectionId, count: 5, points: 1, subjectId, topicId } });
    const sections = await loadSections(examId);

    const papers = new Set(
      await Promise.all(
        ["seed-1", "seed-2", "seed-3", "seed-4"].map(async (seed) =>
          (await planItems(orgId, sections, true, seededRandom(seed))).map((p) => p.questionId).join(","),
        ),
      ),
    );

    // Four candidates, four different papers — the point of a draw.
    expect(papers.size).toBeGreaterThan(1);
  });

  it("never gives the same question twice, even across a fixed item and a draw", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    const fixed = await makeQuestion(`${stamp} fixed one`, topicId);
    for (let i = 0; i < 4; i++) await makeQuestion(`${stamp} overlap ${i}`, topicId);
    await prisma.sectionItem.create({ data: { sectionId, questionId: fixed.questionId, versionId: fixed.versionId, order: 0, points: 1 } });
    // Draw every remaining question, so an overlap would be forced if it were possible.
    await prisma.selectionRule.create({ data: { sectionId, count: 4, points: 1, subjectId, topicId } });

    const planned = await planItems(orgId, await loadSections(examId), false, seededRandom("no-dupes"));
    const ids = planned.map((p) => p.questionId);

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toContain(fixed.questionId);
  });

  it("keeps fixed questions in the authored order when shuffling is off", async () => {
    const { examId, sectionId } = await makeExam({ shuffleQuestions: false });
    const topicId = await makeTopic();
    const first = await makeQuestion(`${stamp} order A`, topicId);
    const second = await makeQuestion(`${stamp} order B`, topicId);
    const third = await makeQuestion(`${stamp} order C`, topicId);
    await prisma.sectionItem.createMany({
      data: [
        { sectionId, questionId: first.questionId, versionId: first.versionId, order: 0, points: 1 },
        { sectionId, questionId: second.questionId, versionId: second.versionId, order: 1, points: 1 },
        { sectionId, questionId: third.questionId, versionId: third.versionId, order: 2, points: 1 },
      ],
    });

    const planned = await planItems(orgId, await loadSections(examId), false, seededRandom("unshuffled"));

    expect(planned.map((p) => p.questionId)).toEqual([first.questionId, second.questionId, third.questionId]);
  });

  it("reorders fixed questions when shuffling is on, keeping the same set", async () => {
    const { examId, sectionId } = await makeExam({ shuffleQuestions: true });
    const topicId = await makeTopic();
    const made = [];
    for (let i = 0; i < 8; i++) made.push(await makeQuestion(`${stamp} shuffle ${i}`, topicId));
    await prisma.sectionItem.createMany({
      data: made.map((q, index) => ({ sectionId, questionId: q.questionId, versionId: q.versionId, order: index, points: 1 })),
    });
    const sections = await loadSections(examId);
    const authored = made.map((q) => q.questionId);

    // Try a few seeds: any single shuffle can legitimately land on the original order.
    const orders = await Promise.all(
      ["s1", "s2", "s3", "s4", "s5"].map(async (seed) =>
        (await planItems(orgId, sections, true, seededRandom(seed))).map((p) => p.questionId),
      ),
    );

    expect(orders.some((order) => order.join(",") !== authored.join(","))).toBe(true);
    for (const order of orders) expect([...order].sort()).toEqual([...authored].sort());
  });

  it("draws only from the pool the rule describes", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    const hard = [];
    for (let i = 0; i < 3; i++) hard.push(await makeQuestion(`${stamp} hard ${i}`, topicId, Difficulty.HARD));
    for (let i = 0; i < 5; i++) await makeQuestion(`${stamp} easy ${i}`, topicId, Difficulty.EASY);
    await prisma.selectionRule.create({ data: { sectionId, count: 3, points: 1, subjectId, topicId, difficulty: Difficulty.HARD } });

    const planned = await planItems(orgId, await loadSections(examId), false, seededRandom("hard-only"));

    expect(planned.map((p) => p.questionId).sort()).toEqual(hard.map((q) => q.questionId).sort());
  });

  it("takes what it can when the pool is smaller than the rule asks for", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    for (let i = 0; i < 2; i++) await makeQuestion(`${stamp} thin ${i}`, topicId);
    await prisma.selectionRule.create({ data: { sectionId, count: 10, points: 1, subjectId, topicId } });

    const planned = await planItems(orgId, await loadSections(examId), false, seededRandom("thin-pool"));

    expect(planned).toHaveLength(2);
  });

  it("spreads draws across the pool rather than favouring a few questions", async () => {
    const { examId, sectionId } = await makeExam();
    const topicId = await makeTopic();
    const made = [];
    for (let i = 0; i < 10; i++) made.push(await makeQuestion(`${stamp} spread ${i}`, topicId));
    await prisma.selectionRule.create({ data: { sectionId, count: 2, points: 1, subjectId, topicId } });
    const sections = await loadSections(examId);

    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const planned = await planItems(orgId, sections, false, seededRandom(`candidate-${i}`));
      for (const item of planned) counts.set(item.questionId, (counts.get(item.questionId) ?? 0) + 1);
    }

    // Every question should be reachable, and none should dominate. 200 attempts
    // drawing 2 of 10 gives an expected 40 appearances each.
    expect(counts.size).toBe(made.length);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(15);
      expect(count).toBeLessThan(80);
    }
  });
});
