import { requireActor } from "@/server/authz";
import { toCsv } from "@/lib/csv";
import { route } from "@/server/http";
import { broadsheetCsvRows, courseBroadsheet } from "@/server/grades/broadsheet";

type Context = { params: Promise<{ id: string }> };

/** The broadsheet as a CSV download, for filing with a registry. */
export const GET = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor("results:read");
  const sheet = await courseBroadsheet(actor, (await params).id);
  const csv = toCsv(broadsheetCsvRows(sheet));
  const filename = `${sheet.course.code.replace(/[^\w.-]+/g, "-")}-broadsheet.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A broadsheet is per-request data about named people; never cache it.
      "Cache-Control": "no-store",
    },
  });
});
