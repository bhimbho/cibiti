import type { Metadata } from "next";
import Link from "next/link";
import { canAnywhere } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { getOrgSettings } from "@/server/settings";
import { FlagToggles } from "./flag-toggles";

export const metadata: Metadata = { title: "Settings | Cibiti" };

const kindLabel = { UNIVERSITY: "University", CBT_CENTRE: "CBT centre", SCHOOL: "School" } as const;

export default async function SettingsPage() {
  const actor = await requirePagePermission("flags:manage");
  const settings = await getOrgSettings(actor);

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
    </main>
  );
}
