import { z } from "zod";
import { requireActor } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { enqueueJob } from "@/server/jobs";
import { validatePeopleImport } from "@/server/people/import";
import { PEOPLE_IMPORT_JOB } from "@/server/people/import-job";

const bodySchema = z.object({
  csv: z.string().min(1, "The file is empty.").max(5_000_000, "The file is too large."),
  commit: z.boolean().default(false),
});

// Preview validates every row; commit queues a background job that creates the accounts.
export const POST = route(async (request: Request) => {
  const actor = await requireActor("people:manage");
  const { csv, commit } = await readJson(request, bodySchema);
  const preview = await validatePeopleImport(actor, csv);

  if (!commit) {
    return Response.json({
      problems: preview.problems,
      unknownHeaders: preview.unknownHeaders,
      total: preview.rows.length,
      valid: preview.rows.filter((r) => r.errors.length === 0).length,
      rows: preview.rows.map(({ password, ...row }) => ({ ...row, hasPassword: Boolean(password) })),
    });
  }

  const job = await enqueueJob(actor, PEOPLE_IMPORT_JOB, { csv });
  return Response.json({ jobId: job.id }, { status: 202 });
});
