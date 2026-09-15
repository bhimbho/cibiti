"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";

type Candidate = { userId: string; name: string; regNumber: string | null; level: string | null; active: boolean };

export function EnrollmentManager({ courseId, candidates }: { courseId: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [regNumbers, setRegNumbers] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; missing?: string[] } | null>(null);

  async function enroll() {
    setPending(true);
    setMessage(null);
    const result = await callApi<{ added: number; alreadyEnrolled: number; notFound: string[] }>(`/api/courses/${courseId}/enrollments`, "POST", { regNumbers });
    setPending(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    const { added, alreadyEnrolled, notFound } = result.data;
    setMessage({
      tone: notFound.length ? "error" : "ok",
      text: `Registered ${added} candidate${added === 1 ? "" : "s"}${alreadyEnrolled ? `; ${alreadyEnrolled} already registered` : ""}${notFound.length ? `; ${notFound.length} not found` : ""}.`,
      missing: notFound,
    });
    if (!notFound.length) setRegNumbers("");
    router.refresh();
  }

  async function remove(candidate: Candidate) {
    if (!window.confirm(`Remove ${candidate.name} from this course?`)) return;
    const result = await callApi(`/api/courses/${courseId}/enrollments`, "DELETE", { userIds: [candidate.userId] });
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    router.refresh();
  }

  const shown = candidates.filter((c) => !filter || `${c.name} ${c.regNumber ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">CANDIDATES</p><h2>Registered candidates ({candidates.length})</h2></div></div>

      <label className="paste-label">
        Register by matric number <span className="field-hint">Paste one per line, or separate with commas</span>
        <textarea value={regNumbers} onChange={(e) => setRegNumbers(e.target.value)} rows={3} placeholder={"CSC/2026/001\nCSC/2026/002"} />
      </label>
      <div className="editor-actions">
        <button type="button" className="secondary-button" disabled={!regNumbers.trim() || pending} onClick={enroll}>{pending ? "Registering…" : "Register candidates"}</button>
      </div>
      {message && (
        <div className={message.tone === "ok" ? "form-message" : "take-warning"} role="status">
          {message.text}
          {message.missing && message.missing.length > 0 && <p className="take-hint">Not found: {message.missing.slice(0, 30).join(", ")}{message.missing.length > 30 ? "…" : ""}</p>}
        </div>
      )}

      {candidates.length > 8 && (
        <label className="dt-search enroll-filter">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter registered candidates" aria-label="Filter registered candidates" />
        </label>
      )}
      <div className="member-list">
        {candidates.length === 0 && <p className="take-loading">No candidates registered yet.</p>}
        {shown.map((c) => (
          <div className="member-row" key={c.userId}>
            <div className="member-details">
              <Link className="dt-link" href={`/people/${c.userId}`}>{c.name}</Link>
              <span>{c.regNumber ?? "—"}{c.level ? ` · ${c.level}` : ""}{c.active ? "" : " · deactivated"}</span>
            </div>
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
