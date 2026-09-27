import type { Metadata } from "next";
import { listLiveAttempts } from "@/server/invigilation";
import { examDayPolicy, mayRestartAtAll } from "@/server/exam-day/store";
import { requirePagePermission } from "@/server/page-auth";
import { InvigilationConsole } from "./invigilation-console";

export const metadata: Metadata = { title: "Invigilation | Cibiti" };

export default async function InvigilationPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const actor = await requirePagePermission("invigilate");
  const { exam } = await searchParams;
  const [data, { policy }] = await Promise.all([
    listLiveAttempts(actor, exam || undefined),
    examDayPolicy(actor.orgId),
  ]);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">EXAM DAY</p>
          <h1>Invigilation</h1>
          <p>Candidates writing right now. Refreshes every 10 seconds.</p>
        </div>
      </div>
      <InvigilationConsole data={data} examId={exam ?? ""} canRestart={mayRestartAtAll(actor, policy)} />
    </main>
  );
}
