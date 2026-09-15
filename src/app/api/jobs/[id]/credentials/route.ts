import { toCsv } from "@/lib/csv";
import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { takeJobCredentials } from "@/server/jobs";

// Returns generated passwords as CSV exactly once, then removes them from the job record.
export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const credentials = await takeJobCredentials(actor, (await params).id);
  const csv = toCsv([["name", "sign_in", "password"], ...credentials.map((c) => [c.name, c.signIn, c.password])]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="imported-passwords.csv"',
      "Cache-Control": "no-store",
    },
  });
});
