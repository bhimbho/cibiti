import type { Metadata } from "next";
import Link from "next/link";
import { canAnywhere } from "@/server/authz";
import { requirePagePermission } from "@/server/page-auth";
import { getOrgSettings } from "@/server/settings";
import { gradeBands } from "@/server/grades/store";
import { examDayPolicy } from "@/server/exam-day/store";
import { impersonationMode } from "@/server/impersonation";
import { FlagToggles } from "./flag-toggles";
import { GradeScaleEditor } from "./grade-scale";
import { ExamDayPolicyForm } from "./exam-day-policy";
import { ImpersonationModeForm } from "./impersonation-mode";

export const metadata: Metadata = { title: "Settings | Cibiti" };

const kindLabel = { UNIVERSITY: "University", CBT_CENTRE: "CBT centre", SCHOOL: "School" } as const;

export default async function SettingsPage() {
  const actor = await requirePagePermission("flags:manage");
  const settings = await getOrgSettings(actor);
  const scale = await gradeBands(actor.orgId);
  const examDay = await examDayPolicy(actor.orgId);
  const viewAs = await impersonationMode(actor.orgId);

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
        <p className="eyebrow">EXAM DAY</p>
        <h2>Recovery and extra time</h2>
        <p className="take-hint">
          What staff may do for a candidate whose exam goes wrong — a dead machine, a power cut, the
          wrong person signed in. Every restart and every minute added is recorded in the audit log.
        </p>
        <ExamDayPolicyForm policy={examDay.policy} isDefault={examDay.isDefault} />
      </section>

      <section className="panel settings-panel">
        <p className="eyebrow">SUPPORT</p>
        <h2>Viewing as a user</h2>
        <p className="take-hint">
          Administrators can open the app as any user in this organisation from that person&rsquo;s
          page, without their password. Starting and stopping are always recorded in the audit log.
        </p>
        <ImpersonationModeForm mode={viewAs.mode} isDefault={viewAs.isDefault} />
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
