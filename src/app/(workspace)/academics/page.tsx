import type { Metadata } from "next";
import { AcademicsTabs } from "@/components/academics/academics-tabs";
import { StructureManager } from "@/components/academics/structure-manager";
import { getAcademicStructure } from "@/server/academics/structure";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Academics | Cibiti" };

export default async function AcademicsPage() {
  const actor = await requirePagePermission("academics:manage");
  const data = await getAcademicStructure(actor);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Academic structure</h1>
          <p>Departments, levels, groups, the academic calendar and exam venues. Rename anything by editing it in place.</p>
        </div>
      </div>
      <AcademicsTabs active="structure" />
      <StructureManager data={data} />
    </main>
  );
}
