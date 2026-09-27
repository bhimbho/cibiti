import type { Metadata } from "next";
import Link from "next/link";
import { canAnywhere } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { getOrgSettings } from "@/server/settings";
import { gradeBands } from "@/server/grades/store";
import { FlagToggles } from "./flag-toggles";
import { GradeScaleEditor } from "./grade-scale";

export const metadata: Metadata = { title: "Settings | Cibiti" };

const kindLabel = { UNIVERSITY: "University", CBT_CENTRE: "CBT centre", SCHOOL: "School" } as const;

export default async function SettingsPage() {
  const actor = await requirePagePermission("flags:manage");
  const settings = await getOrgSettings(actor);
  const scale = await gradeBands(actor.orgId);

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Settings</h1>
          <p>{settings.org.name} · {kindLabel[settings.org.kind]}</p>
        </div>
        {canAnywhere(actor, "audit:read") && <Link className="outline-button" href="/settings/audit">Audit log</Link>}
      </div>

      <section className="panel settings-panel">
        <p className="eyebrow">FEATURES</p>
        <h2>Optional features</h2>
        <p className="take-hint">These features are fully built but off by default. Turning one on takes effect immediately for new attempts and is recorded in the audit log.</p>
        <FlagToggles flags={settings.flags} />
      </section>

      <section className="panel settings-panel">
        <p className="eyebrow">GRADING</p>
        <h2>Grading scale</h2>
        <p className="take-hint">
          Used for letter grades on results and broadsheets, and for grade points in a GPA. A score
          earns the highest band whose floor it reaches.
        </p>
        <GradeScaleEditor bands={scale.bands} isDefault={scale.isDefault} />
      </section>
    </main>
  );
}
