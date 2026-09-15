import { JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { actorForUser } from "../authz";
import { updateJob } from "../jobs";
import { validatePeopleImport } from "./import";
import { generatePassword, hashPassword } from "./passwords";

export const PEOPLE_IMPORT_JOB = "people.import";

/** Worker processor: creates accounts from a validated CSV in small transactions, reporting progress. */
export async function runPeopleImport(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== JobStatus.QUEUED) return;
  const input = job.input as { csv?: string; termId?: string | null } | null;
  const actor = job.createdById ? await actorForUser(job.createdById) : null;

  if (!actor || !input?.csv) {
    await updateJob(jobId, { status: JobStatus.FAILED, error: "The import could not start.", clearInput: true });
    return;
  }

  await updateJob(jobId, { status: JobStatus.RUNNING, progress: 1 });
  try {
    const { rows, problems } = await validatePeopleImport(actor, input.csv);
    if (problems.length) {
      await updateJob(jobId, { status: JobStatus.FAILED, error: problems.join(" "), clearInput: true });
      return;
    }

    const valid = rows.filter((r) => r.errors.length === 0);
    const credentials: { name: string; signIn: string; password: string }[] = [];
    const failed: { line: number; errors: string[] }[] = rows.filter((r) => r.errors.length).map((r) => ({ line: r.line, errors: r.errors }));
    let created = 0;

    for (let i = 0; i < valid.length; i += 25) {
      const batch = valid.slice(i, i + 25);
      const prepared = [];
      for (const row of batch) {
        const password = row.password ?? generatePassword();
        prepared.push({ row, password, passwordHash: await hashPassword(password, true) });
      }

      for (const { row, password, passwordHash } of prepared) {
        try {
          await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                orgId: actor.orgId,
                name: row.name,
                email: row.email,
                regNumber: row.regNumber,
                passwordHash,
                departmentId: row.departmentId,
                levelId: row.levelId,
                memberships: { create: row.roles.map((role) => ({ orgId: actor.orgId, role })) },
                groupLinks: { create: row.groupIds.map((groupId) => ({ groupId })) },
                enrollments: { create: row.courseIds.map((courseId) => ({ courseId })) },
              },
              select: { id: true },
            });
            await tx.auditLog.create({
              data: { orgId: actor.orgId, actorId: actor.userId, action: "person.import", entityType: "user", entityId: user.id, after: { jobId, line: row.line, roles: row.roles } },
            });
          });
          created++;
          if (!row.password) credentials.push({ name: row.name, signIn: row.regNumber ?? row.email ?? "", password });
        } catch (error) {
          const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
          failed.push({ line: row.line, errors: [duplicate ? "Email or matric number was taken while importing." : "Could not be created."] });
        }
      }
      await updateJob(jobId, { progress: ((i + batch.length) / Math.max(valid.length, 1)) * 100 });
    }

    await updateJob(jobId, {
      status: JobStatus.SUCCEEDED,
      progress: 100,
      result: { total: rows.length, created, failed: failed.sort((a, b) => a.line - b.line), credentials },
      clearInput: true,
    });
  } catch (error) {
    console.error("[people.import] failed", error);
    await updateJob(jobId, { status: JobStatus.FAILED, error: "The import failed unexpectedly. No further rows were processed.", clearInput: true });
  }
}
