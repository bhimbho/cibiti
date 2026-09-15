import { Queue, type ConnectionOptions } from "bullmq";

export const QUEUE_NAME = "cibiti";

export const JOBS = {
  autoSubmit: "attempt.auto-submit",
  sweepExpired: "attempt.sweep-expired",
} as const;

export type AutoSubmitJob = { attemptId: string };

export function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    // Required by BullMQ workers; harmless for producers.
    maxRetriesPerRequest: null,
  };
}

let queue: Queue | undefined;

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000, attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  });
  return queue;
}

const autoSubmitJobId = (attemptId: string) => `autosubmit-${attemptId}`;

/**
 * Schedule the server-side auto-submit for an attempt. Safe to call again after a deadline changes.
 * Failures are logged, not thrown: the periodic sweep in the worker still closes expired attempts.
 */
export async function scheduleAutoSubmit(attemptId: string, deadlineAt: Date | null, graceMs: number): Promise<void> {
  try {
    const q = getQueue();
    await q.remove(autoSubmitJobId(attemptId)).catch(() => 0);
    if (!deadlineAt) return;
    const delay = Math.max(0, deadlineAt.getTime() + graceMs - Date.now());
    await q.add(JOBS.autoSubmit, { attemptId } satisfies AutoSubmitJob, { jobId: autoSubmitJobId(attemptId), delay });
  } catch (error) {
    console.error(`Could not schedule auto-submit for attempt ${attemptId}; the sweep will handle it.`, error);
  }
}
