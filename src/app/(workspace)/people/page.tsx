import type { Metadata } from "next";
import Link from "next/link";
import { peopleTableConfig } from "@/lib/people-table";
import { parseTableParams } from "@/lib/table-params";
import { requirePagePermission } from "@/server/page-auth";
import { listPeople } from "@/server/people/list";
import { PeopleTable } from "./people-table";

export const metadata: Metadata = { title: "People | Cibiti" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission("people:manage");
  const params = parseTableParams(await searchParams, peopleTableConfig);
  const { rows, total, facets } = await listPeople(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">PEOPLE</p>
          <h1>Candidates &amp; staff</h1>
          <p>Create accounts, import candidates from a spreadsheet, assign roles and manage access.</p>
        </div>
        <div className="exam-detail-actions">
          <Link className="outline-button" href="/people/import">Import CSV</Link>
          <Link className="primary-button" href="/people/new">Add person<span>-&gt;</span></Link>
        </div>
      </div>
      <PeopleTable
        rows={rows}
        total={total}
        params={params}
        facets={[
          { id: "role", label: "Role", options: facets.role },
          { id: "department", label: "Department", options: facets.department },
          { id: "level", label: "Level", options: facets.level },
          { id: "active", label: "Status", options: facets.active },
        ]}
      />
    </main>
  );
}
