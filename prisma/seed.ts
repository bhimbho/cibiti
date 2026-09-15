// Demo data for a university-style organisation. Usage: npm run db:seed
import { Difficulty, ExamStatus, OrgKind, PrismaClient, QuestionStatus, ReleasePolicy, ReviewDetail, Role, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { parseAuthoredItem } from "../src/items/registry";

const prisma = new PrismaClient();
const PASSWORD = "password123";

type SeedQuestion = {
  type: string;
  text: string;
  interaction: unknown;
  scoring: unknown;
  difficulty?: Difficulty;
  points?: number;
  topicId: string;
  explanation?: string;
};

async function createQuestion(tx: Prisma.TransactionClient, orgId: string, subjectId: string, authorId: string, q: SeedQuestion) {
  const parsed = parseAuthoredItem(q.type, q.interaction, q.scoring);
  if (!parsed.ok) throw new Error(`Invalid seed question "${q.text}": ${parsed.errors.join(", ")}`);

  const question = await tx.question.create({ data: { orgId, status: QuestionStatus.APPROVED, createdById: authorId } });
  const version = await tx.questionVersion.create({
    data: {
      questionId: question.id,
      version: 1,
      type: q.type,
      content: { text: q.text },
      interaction: parsed.value.interaction as Prisma.InputJsonValue,
      scoring: parsed.value.scoring as Prisma.InputJsonValue,
      explanation: q.explanation,
      difficulty: q.difficulty ?? Difficulty.MEDIUM,
      points: q.points ?? 1,
      subjectId,
      topicId: q.topicId,
      createdById: authorId,
    },
  });
  await tx.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
  return { questionId: question.id, versionId: version.id, points: version.points };
}

const choice = (...texts: string[]) => ({ options: texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text })) });

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (existing) {
    console.log("Demo organisation already exists; nothing to do. Reset the database to reseed.");
    return;
  }

  const passwordHash = await hash(PASSWORD, 12);

  await prisma.$transaction(
    async (tx) => {
      const org = await tx.organization.create({ data: { name: "Cibiti Demo University", slug: "demo", kind: OrgKind.UNIVERSITY } });
      const session = await tx.academicSession.create({ data: { orgId: org.id, name: "2026/2027", isCurrent: true } });
      const term = await tx.term.create({ data: { sessionId: session.id, name: "First Semester", order: 1 } });

      const csc = await tx.department.create({ data: { orgId: org.id, name: "Computer Science", code: "CSC" } });
      await tx.department.create({ data: { orgId: org.id, name: "Mathematics", code: "MTH" } });
      const l100 = await tx.level.create({ data: { orgId: org.id, name: "100L", order: 1 } });
      await tx.level.create({ data: { orgId: org.id, name: "200L", order: 2 } });

      const person = (name: string, email: string | null, roles: Role[], extra: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
        tx.user.create({
          data: { orgId: org.id, name, email, passwordHash, ...extra, memberships: { create: roles.map((role) => ({ orgId: org.id, role })) } },
        });

      await person("Ada Admin", "admin@cibiti.dev", [Role.ORG_ADMIN]);
      await person("Emeka Officer", "officer@cibiti.dev", [Role.EXAM_OFFICER]);
      const author = await person("Dr. Funke Instructor", "instructor@cibiti.dev", [Role.AUTHOR, Role.GRADER]);
      await person("Musa Invigilator", "invigilator@cibiti.dev", [Role.INVIGILATOR]);
      const candidates = await Promise.all([
        person("Demo Student", "student@cibiti.dev", [Role.CANDIDATE], { regNumber: "CSC/2026/001", departmentId: csc.id, levelId: l100.id }),
        person("Chiamaka Obi", null, [Role.CANDIDATE], { regNumber: "CSC/2026/002", departmentId: csc.id, levelId: l100.id }),
        person("Tunde Bakare", null, [Role.CANDIDATE], { regNumber: "CSC/2026/003", departmentId: csc.id, levelId: l100.id }),
      ]);

      const course = await tx.course.create({ data: { orgId: org.id, departmentId: csc.id, levelId: l100.id, code: "CSC101", title: "Introduction to Computer Science", credits: 3 } });
      await tx.enrollment.createMany({ data: candidates.map((c) => ({ userId: c.id, courseId: course.id, termId: term.id })) });

      const subject = await tx.subject.create({ data: { orgId: org.id, name: "Computer Science", code: "CSC" } });
      const fundamentals = await tx.topic.create({ data: { subjectId: subject.id, name: "Fundamentals" } });
      const networking = await tx.topic.create({ data: { subjectId: subject.id, name: "Networking" } });
      const general = await tx.subject.create({ data: { orgId: org.id, name: "General Studies", code: "GST" } });
      const civics = await tx.topic.create({ data: { subjectId: general.id, name: "Nigerian Civics" } });

      const make = (subjectId: string, q: SeedQuestion) => createQuestion(tx, org.id, subjectId, author.id, q);

      const fixed = [
        await make(subject.id, { type: "single-choice", topicId: fundamentals.id, difficulty: Difficulty.EASY, text: "Which of these is an input device?", interaction: choice("Monitor", "Keyboard", "Printer", "Speaker"), scoring: { correctOptionId: "b" } }),
        await make(subject.id, { type: "single-choice", topicId: fundamentals.id, text: "What does CPU stand for?", interaction: choice("Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Control Processing Unit"), scoring: { correctOptionId: "a" } }),
        await make(subject.id, { type: "true-false", topicId: fundamentals.id, difficulty: Difficulty.EASY, text: "RAM keeps its contents when the computer is switched off.", interaction: {}, scoring: { correct: "false" }, explanation: "RAM is volatile memory." }),
        await make(subject.id, { type: "multiple-response", topicId: fundamentals.id, points: 2, text: "Which of the following are operating systems?", interaction: choice("Linux", "Microsoft Word", "Windows", "Google Chrome", "macOS"), scoring: { correctOptionIds: ["a", "c", "e"], mode: "partial" } }),
        await make(subject.id, { type: "short-answer", topicId: fundamentals.id, text: "What number base does binary use? (digits only)", interaction: { maxLength: 10 }, scoring: { acceptedAnswers: ["2"] } }),
        await make(subject.id, { type: "short-answer", topicId: fundamentals.id, difficulty: Difficulty.HARD, points: 2, text: "Name the step of the fetch–decode–execute cycle in which the CPU interprets an instruction.", interaction: { maxLength: 60 }, scoring: { acceptedAnswers: ["decode", "decoding"], maxTypos: 1 } }),
      ];

      // Pool for the random section.
      await make(subject.id, { type: "single-choice", topicId: networking.id, text: "Which device forwards packets between different networks?", interaction: choice("Switch", "Router", "Hub", "Repeater"), scoring: { correctOptionId: "b" } });
      await make(subject.id, { type: "true-false", topicId: networking.id, text: "An IPv4 address is 32 bits long.", interaction: {}, scoring: { correct: "true" } });
      await make(subject.id, { type: "single-choice", topicId: networking.id, text: "What does LAN stand for?", interaction: choice("Large Area Network", "Local Area Network", "Linked Access Node", "Long Antenna Network"), scoring: { correctOptionId: "b" } });
      await make(subject.id, { type: "single-choice", topicId: networking.id, difficulty: Difficulty.HARD, text: "Which protocol assigns IP addresses automatically on a network?", interaction: choice("DNS", "HTTP", "DHCP", "FTP"), scoring: { correctOptionId: "c" } });
      await make(subject.id, { type: "multiple-response", topicId: networking.id, points: 2, text: "Which of these are transmission media?", interaction: choice("Fibre-optic cable", "Twisted pair cable", "Compiler", "Radio waves"), scoring: { correctOptionIds: ["a", "b", "d"], mode: "right-minus-wrong" } });

      const gst = [
        await make(general.id, { type: "single-choice", topicId: civics.id, difficulty: Difficulty.EASY, text: "In what year did Nigeria gain independence?", interaction: choice("1957", "1960", "1963", "1966"), scoring: { correctOptionId: "b" } }),
        await make(general.id, { type: "true-false", topicId: civics.id, difficulty: Difficulty.EASY, text: "Abuja is the capital of Nigeria.", interaction: {}, scoring: { correct: "true" } }),
        await make(general.id, { type: "short-answer", topicId: civics.id, text: "How many states are there in Nigeria? (number only)", interaction: { maxLength: 5 }, scoring: { acceptedAnswers: ["36", "thirty-six", "thirty six"] } }),
      ];

      await tx.exam.create({
        data: {
          orgId: org.id,
          title: "CSC101 Continuous Assessment 1",
          description: "Fundamentals and an introduction to networking.",
          instructions: "Answer all questions. Section B questions are drawn at random for each candidate.",
          status: ExamStatus.PUBLISHED,
          publishedAt: new Date(),
          courseId: course.id,
          departmentId: csc.id,
          termId: term.id,
          authorId: author.id,
          timeLimitMin: 15,
          passMarkPct: 50,
          maxAttempts: 1,
          shuffleOptions: true,
          releasePolicy: ReleasePolicy.IMMEDIATE,
          reviewDetail: ReviewDetail.BREAKDOWN,
          sections: {
            create: [
              { title: "Section A: Fundamentals", order: 0, items: { create: fixed.map((f, order) => ({ order, questionId: f.questionId, versionId: f.versionId, points: f.points })) } },
              { title: "Section B: Networking", order: 1, rules: { create: [{ count: 3, points: 1, subjectId: subject.id, topicId: networking.id }] } },
            ],
          },
        },
      });

      await tx.exam.create({
        data: {
          orgId: org.id,
          title: "General Studies Practice Quiz",
          description: "Open practice for every candidate. Three attempts allowed.",
          status: ExamStatus.PUBLISHED,
          publishedAt: new Date(),
          authorId: author.id,
          timeLimitMin: null,
          maxAttempts: 3,
          shuffleQuestions: true,
          releasePolicy: ReleasePolicy.IMMEDIATE,
          reviewDetail: ReviewDetail.FULL,
          sections: { create: [{ title: "Practice", order: 0, items: { create: gst.map((g, order) => ({ order, questionId: g.questionId, versionId: g.versionId, points: g.points })) } }] },
        },
      });

      await tx.featureFlag.createMany({
        data: [
          { orgId: org.id, key: "proctoring", enabled: false },
          { orgId: org.id, key: "ai-assist", enabled: false },
        ],
      });
    },
    { timeout: 60_000 },
  );

  console.log("Seeded Cibiti Demo University. Password for every account:", PASSWORD);
  console.table([
    { role: "Org admin", signIn: "admin@cibiti.dev" },
    { role: "Exam officer", signIn: "officer@cibiti.dev" },
    { role: "Author + grader", signIn: "instructor@cibiti.dev" },
    { role: "Invigilator", signIn: "invigilator@cibiti.dev" },
    { role: "Candidate", signIn: "student@cibiti.dev or CSC/2026/001" },
    { role: "Candidate", signIn: "CSC/2026/002" },
    { role: "Candidate", signIn: "CSC/2026/003" },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
