import type { Metadata } from "next";
import { auditTableConfig } from "@/lib/audit-table";
import { parseTableParams } from "@/lib/table-params";
import { listAuditLog } from "@/server/audit-log";
import { requirePagePermission } from "@/server/page-auth";
import { AuditTable } from "./audit-table";

export const metadata: Metadata = { title: "Audit log | Cibiti" };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission("audit:read");
  const params = parseTableParams(await searchParams, auditTableConfig);
  const { rows, total, facets } = await listAuditLog(actor, params);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Audit log</h1>
          <p>Every privileged action: who did it, when, and what changed.</p>
        </div>
      </div>
      <AuditTable
        rows={rows}
        total={total}
        params={params}
        facets={[
          { id: "action", label: "Action", options: facets.action },
          { id: "entityType", label: "Record", options: facets.entityType },
          { id: "actor", label: "Person", options: facets.actor },
        ]}
      />
    </main>
  );
}
