import type { Metadata } from "next";
import Link from "next/link";
import { ImportWizard } from "@/components/people/import-wizard";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Import people | Cibiti" };

export default async function ImportPeoplePage() {
  await requirePagePermission("people:manage");
  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/people">&lt;- Back to people</Link>
          <p className="eyebrow">PEOPLE</p>
          <h1>Import from a spreadsheet</h1>
          <p>Check every row before anything is created. Large files are imported in the background.</p>
        </div>
      </div>
      <ImportWizard />
    </main>
  );
}
