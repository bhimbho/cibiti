"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { QuestionRow } from "@/lib/question-table";
import { callApi } from "./api";

type Props = {
  examId: string;
  sectionTitle: string;
  inExam: Set<string>;
  onClose: () => void;
  onAdd: (questionIds: string[]) => Promise<void>;
};

export function QuestionPicker({ examId, sectionTitle, inExam, onClose, onAdd }: Props) {
  const [q, setQ] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ rows: QuestionRow[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    params.set("status", includeDrafts ? "APPROVED,IN_REVIEW,DRAFT" : "APPROVED");
    const timer = setTimeout(() => {
      void callApi<{ rows: QuestionRow[]; total: number; pageSize: number }>(`/api/exams/${examId}/question-picker?${params}`, "GET").then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setResult(res.data);
          setError(null);
        } else {
          setError(res.error);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [examId, includeDrafts, page, q]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector("input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal picker" ref={dialog}>
        <div className="picker-head">
          <div>
            <p className="eyebrow">ADD TO {sectionTitle.toUpperCase()}</p>
            <h2 id="picker-title">Choose questions</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="picker-tools">
          <label className="dt-search">
            <Search size={15} aria-hidden="true" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search question text" aria-label="Search question text" />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={includeDrafts} onChange={(e) => { setIncludeDrafts(e.target.checked); setPage(1); }} /> Include drafts and questions in review
          </label>
        </div>
        {error && <p className="take-error">{error}</p>}
        <div className="picker-list">
          {!result && <p className="take-loading"><Loader2 size={16} className="spin" /> Loading…</p>}
          {result?.rows.length === 0 && <p className="take-loading">No questions match.</p>}
          {result?.rows.map((row) => {
            const already = inExam.has(row.id);
            return (
              <label key={row.id} className={`picker-row ${already ? "disabled" : ""}`}>
                <input
                  type="checkbox"
                  disabled={already}
                  checked={already || selected.includes(row.id)}
                  onChange={() => setSelected((s) => (s.includes(row.id) ? s.filter((x) => x !== row.id) : [...s, row.id]))}
                />
                <span className="picker-text">
                  <strong>{row.text}</strong>
                  <small>
                    {row.typeLabel} · {row.difficulty.toLowerCase()} · {row.points} mark{row.points === 1 ? "" : "s"}
                    {row.subject ? ` · ${row.subject}` : ""}
                    {row.status !== "APPROVED" ? ` · ${row.status.replace("_", " ").toLowerCase()}` : ""}
                    {already ? " · already in this exam" : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        <div className="picker-foot">
          <div className="dt-pager">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span>Page {page} of {pages}</span>
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={selected.length === 0 || adding}
            onClick={async () => {
              setAdding(true);
              await onAdd(selected);
              setAdding(false);
            }}
          >
            {adding ? "Adding…" : `Add ${selected.length || ""} question${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
