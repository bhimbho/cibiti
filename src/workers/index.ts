// Background worker. Run alongside the app: `npm run worker`.
import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { autoSubmitIfExpired, sweepExpiredAttempts } from "@/server/attempts/engine";
import { getQueue, JOBS, QUEUE_NAME, redisConnection, type AutoSubmitJob } from "@/server/queue";
import { PEOPLE_IMPORT_JOB, runPeopleImport } from "@/server/people/import-job";

async function main() {
  const queue = getQueue();

  // Safety net for lost or never-scheduled auto-submit jobs (Redis restart, scheduling failure).
  await queue.upsertJobScheduler("sweep-expired-attempts", { every: 30_000 }, { name: JOBS.sweepExpired });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case JOBS.autoSubmit: {
          const { attemptId } = job.data as AutoSubmitJob;
          return { submitted: await autoSubmitIfExpired(attemptId) };
        }
        case JOBS.sweepExpired:
          return { closed: await sweepExpiredAttempts() };
        case PEOPLE_IMPORT_JOB:
          await runPeopleImport((job.data as { jobId: string }).jobId);
          return { done: true };
        default:
          throw new Error(`No processor for job "${job.name}".`);
      }
    },
    { connection: redisConnection(), concurrency: 8 },
  );

  worker.on("completed", (job, result) => {
    if (job.name !== JOBS.sweepExpired || (result as { closed: number }).closed > 0) {
      console.log(`[worker] ${job.name} ${job.id} done`, result);
    }
  });
  worker.on("failed", (job, error) => console.error(`[worker] ${job?.name} ${job?.id} failed`, error));

  console.log("[worker] listening on queue", QUEUE_NAME);

  const shutdown = async () => {
    console.log("[worker] shutting down");
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
