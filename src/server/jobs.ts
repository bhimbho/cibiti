import { JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./authz";
import { canAnywhere } from "./authz";
import { forbidden, notFound, toJson } from "./http";
import { getQueue } from "./queue";

/** Create a tracked background job and enqueue it. The Job row id is also the queue job id. */
export async function enqueueJob(actor: Actor, type: string, input: unknown) {
  const job = await prisma.job.create({
    data: { orgId: actor.orgId, type, createdById: actor.userId, input: toJson(input) as Prisma.InputJsonValue },
    select: { id: true },
  });
  await getQueue().add(type, { jobId: job.id }, { jobId: job.id, attempts: 1 });
  return job;
}

export async function updateJob(id: string, data: { status?: JobStatus; progress?: number; result?: unknown; error?: string | null; clearInput?: boolean }) {
  await prisma.job.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.progress !== undefined ? { progress: Math.max(0, Math.min(100, Math.round(data.progress))) } : {}),
      ...(data.result !== undefined ? { result: toJson(data.result) as Prisma.InputJsonValue } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.status === JobStatus.SUCCEEDED || data.status === JobStatus.FAILED ? { finishedAt: new Date() } : {}),
      ...(data.clearInput ? { input: Prisma.JsonNull } : {}),
    },
  });
}

async function loadVisibleJob(actor: Actor, id: string) {
  const job = await prisma.job.findFirst({ where: { id, orgId: actor.orgId } });
  if (!job) throw notFound("Job");
  if (job.createdById !== actor.userId && !canAnywhere(actor, "people:manage")) throw forbidden();
  return job;
}

type ResultWithCredentials = { credentials?: unknown[] } & Record<string, unknown>;

export async function getJobStatus(actor: Actor, id: string) {
  const job = await loadVisibleJob(actor, id);
  const result = (job.result ?? null) as ResultWithCredentials | null;
  const { credentials, ...rest } = result ?? {};
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: result ? rest : null,
    credentialsAvailable: Array.isArray(credentials) && credentials.length > 0,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

/** Generated passwords can be collected exactly once, then they are wiped from the database. */
export async function takeJobCredentials(actor: Actor, id: string) {
  const job = await loadVisibleJob(actor, id);
  if (job.createdById !== actor.userId) throw forbidden("Only the person who ran the import can download its passwords.");
  const result = (job.result ?? {}) as ResultWithCredentials;
  const credentials = Array.isArray(result.credentials) ? result.credentials : [];
  if (credentials.length === 0) return [];
  const { credentials: _removed, ...rest } = result;
  void _removed;
  await prisma.job.update({ where: { id }, data: { result: toJson({ ...rest, credentialsDownloadedAt: new Date().toISOString() }) as Prisma.InputJsonValue } });
  return credentials as { name: string; signIn: string; password: string }[];
}
