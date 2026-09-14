import { PrismaClient, QuestionType, Difficulty, ExamStatus } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash("password123", 12);

  const instructor = await prisma.user.upsert({
    where: { email: "instructor@cibiti.dev" },
    update: {},
    create: { email: "instructor@cibiti.dev", name: "Demo Instructor", passwordHash, role: "INSTRUCTOR" },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@cibiti.dev" },
    update: {},
    create: { email: "student@cibiti.dev", name: "Demo Student", passwordHash, role: "STUDENT", studentId: "STU/2024/001" },
  });

  const departments = [
    { code: "CS", name: "Computer Science" },
    { code: "ME", name: "Mechanical Engineering" },
    { code: "EE", name: "Electrical Engineering" },
    { code: "BIO", name: "Biological Sciences" },
    { code: "ACC", name: "Accounting & Finance" },
    { code: "LAW", name: "Law" },
  ];

  const createdDepartments = [];
  for (const d of departments) {
    const dep = await prisma.department.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
    createdDepartments.push(dep);
  }

  const csDept = createdDepartments.find((d) => d.code === "CS");

  const course = await prisma.course.upsert({
    where: { code: "CS101" },
    update: {},
    create: {
      code: "CS101",
      title: "Introduction to Computer Science",
      credits: 3,
      departmentId: csDept?.id,
    },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId: course.id } },
    update: {},
    create: { userId: student.id, courseId: course.id, role: "STUDENT" },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: instructor.id, courseId: course.id } },
    update: {},
    create: { userId: instructor.id, courseId: course.id, role: "INSTRUCTOR" },
  });

  const q1 = await prisma.question.create({
    data: {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: "What is the capital of France?",
      data: { options: ["Paris", "London", "Berlin", "Madrid"], answer: "Paris" },
      difficulty: Difficulty.EASY,
      points: 1,
      createdById: instructor.id,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: "Which planet is known as the Red Planet?",
      data: { options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: "Mars" },
      difficulty: Difficulty.MEDIUM,
      points: 2,
      createdById: instructor.id,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      type: QuestionType.TRUE_FALSE,
      prompt: "Water boils at 100 degrees Celsius at sea level.",
      data: { options: ["True", "False"], answer: "True" },
      difficulty: Difficulty.EASY,
      points: 1,
      createdById: instructor.id,
    },
  });

  const exam = await prisma.exam.create({
    data: {
      title: "General Knowledge Sample",
      description: "A short sample assessment covering general knowledge.",
      status: ExamStatus.PUBLISHED,
      timeLimitMin: 10,
      passMarkPct: 50,
      maxAttempts: 3,
      shuffleQuestions: true,
      shuffleOptions: true,
      authorId: instructor.id,
      items: {
        create: [
          { questionId: q1.id, order: 0, points: 1 },
          { questionId: q2.id, order: 1, points: 2 },
          { questionId: q3.id, order: 2, points: 1 },
        ],
      },
    },
  });

  // Attach the sample exam to this course
  await prisma.exam.update({
    where: { id: exam.id },
    data: { courseId: course.id },
  });

  console.log("Seeded demo data:");
  console.log(`  Instructor: instructor@cibiti.dev / password123`);
  console.log(`  Student:    student@cibiti.dev / password123`);
  console.log(`  Course:     ${course.title} (${course.code})`);
  console.log(`  Departments: ${createdDepartments.length} created (${csDept?.name})`);
  console.log(`  Exam:       ${exam.title} (${exam.id})`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
