"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, FileText, LogOut, MonitorSmartphone } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";
import type { LiveAttempt } from "@/server/invigilation";

type Data = {
  rows: LiveAttempt[];
  serverNow: string;
  exams: { value: string; label: string }[];
  summary: { total: number; online: number; idle: number; offline: number; flagged: number };
};

function formatLeft(ms: number) {
  if (ms <= 0) return "Time up";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
}

export function InvigilationConsole({ data, examId }: { data: Data; examId: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const offset = useRef<number | null>(null);

  // Correct for the invigilator's clock using the server time of the latest refresh.
  useEffect(() => {
    offset.current = null;
    const tick = () => {
      offset.current ??= Date.parse(data.serverNow) - Date.now();
      setNow(Date.now() + offset.current);
    };
    const clock = setInterval(tick, 1000);
    const refresh = setInterval(() => router.refresh(), 10_000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [data.serverNow, router]);

  async function act(url: string, body: unknown, success: string) {
    setMessage(null);
    const result = await callApi(url, "POST", body);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: success });
    router.refresh();
  }

  function extend(row: LiveAttempt) {
    const minutes = Number(window.prompt(`Add how many minutes for ${row.candidate}?`, "10"));
    if (!minutes) return;
    const reason = window.prompt("Reason (optional, e.g. power outage)") ?? undefined;
    void act(`/api/attempts/${row.id}/extend`, { minutes, reason: reason || undefined }, `Added ${minutes} minutes for ${row.candidate}.`);
  }

  function release(row: LiveAttempt) {
    if (!window.confirm(`Allow ${row.candidate} to continue on a different computer?`)) return;
    void act(`/api/attempts/${row.id}/release-device`, {}, `${row.candidate} can now sign in on another computer to continue.`);
  }

  function forceSubmit(row: LiveAttempt) {
    const reason = window.prompt(`Submit ${row.candidate}'s exam now? Give a reason:`);
    if (!reason?.trim()) return;
    void act(`/api/attempts/${row.id}/force-submit`, { reason }, `${row.candidate}'s exam was submitted.`);
  }

  return (
    <>
      <section className="stats-grid stats-grid-4 live-stats">
        <article className="stat-card"><div className="stat-label">WRITING</div><strong>{data.summary.total}</strong><span className="trend neutral">In progress</span></article>
        <article className="stat-card"><div className="stat-label">ONLINE</div><strong>{data.summary.online}</strong><span className="trend positive">Saved in the last 45s</span></article>
        <article className="stat-card"><div className="stat-label">IDLE / OFFLINE</div><strong>{data.summary.idle + data.summary.offline}</strong><span className="trend neutral">{data.summary.offline} offline</span></article>
        <article className="stat-card highlight"><div className="stat-label">FLAGGED</div><strong>{data.summary.flagged}</strong><span className="trend neutral">Integrity events</span></article>
      </section>

      <div className="dt-toolbar live-toolbar">
        <label className="dt-page-size">
          Exam
          <select value={examId} onChange={(e) => router.replace(e.target.value ? `/invigilation?exam=${e.target.value}` : "/invigilation")}>
            <option value="">All exams</option>
            {data.exams.map((exam) => <option key={exam.value} value={exam.value}>{exam.label}</option>)}
          </select>
        </label>
      </div>

      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}

      <div className="dt dt-scroll">
        <table>
          <thead>
            <tr><th>Candidate</th><th>Exam</th><th>Status</th><th>Progress</th><th className="right">Time left</th><th className="right">Flags</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr><td className="dt-empty" colSpan={7}>Nobody is writing an exam right now.</td></tr>
            )}
            {data.rows.map((row) => {
              const left = row.deadlineAt && now !== null ? Date.parse(row.deadlineAt) - now : null;
              return (
                <tr key={row.id}>
                  <td>
                    <div className="dt-primary">
                      <strong>{row.candidate}</strong>
                      <small>{row.regNumber ?? "—"}</small>
                    </div>
                  </td>
                  <td>
                    <div className="dt-primary">
                      <span>{row.exam}</span>
                      <small>{[row.sitting, row.lab].filter(Boolean).join(" · ") || "No sitting"}</small>
                    </div>
                  </td>
                  <td><span className={`connection ${row.connection}`}><i />{row.connection}</span></td>
                  <td>
                    <div className="mini-progress" aria-label={`${row.answered} of ${row.total} answered`}>
                      <span style={{ width: `${row.total ? (row.answered / row.total) * 100 : 0}%` }} />
                    </div>
                    <small className="take-hint">{row.answered}/{row.total}</small>
                  </td>
                  <td className={`right ${left !== null && left < 5 * 60_000 ? "score-fail" : ""}`}>
                    {row.deadlineAt ? (left === null ? "…" : formatLeft(left)) : "Untimed"}
                    {row.extensionMin > 0 && <small className="take-hint"> +{row.extensionMin}m</small>}
                  </td>
                  <td className="right">{row.flags ? <span className="live-badge">{row.flags}</span> : "0"}</td>
                  <td className="right">
                    <span className="table-actions">
                      <button type="button" className="icon-btn" aria-label={`Add time for ${row.candidate}`} title="Add time" onClick={() => extend(row)}><Clock size={14} /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${row.candidate} to another computer`} title="Move to another computer" onClick={() => release(row)}><MonitorSmartphone size={14} /></button>
                      <Link className="icon-btn" aria-label={`Open ${row.candidate}'s report`} title="Open report" href={`/results/${row.id}`}><FileText size={14} /></Link>
                      <button type="button" className="icon-btn icon-btn--danger" aria-label={`Submit ${row.candidate}'s exam now`} title="Submit now" onClick={() => forceSubmit(row)}><LogOut size={14} /></button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
