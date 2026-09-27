"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";
import { scaleProblems, type Band } from "@/server/grades/scale";

type Row = { label: string; minPercent: string; gradePoint: string };

function toRows(bands: Band[]): Row[] {
  return bands.map((b) => ({
    label: b.label,
    minPercent: String(b.minPercent),
    gradePoint: String(b.gradePoint),
  }));
}

/** Parsed for validation and saving; blank or non-numeric reads as 0 so the
 *  problem list can describe it rather than the form rejecting a keystroke. */
function toBands(rows: Row[]): Band[] {
  return rows.map((r) => ({
    label: r.label,
    minPercent: Number(r.minPercent) || 0,
    gradePoint: Number(r.gradePoint) || 0,
  }));
}

export function GradeScaleEditor({ bands, isDefault }: { bands: Band[]; isDefault: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(toRows(bands));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const problems = scaleProblems(toBands(rows));

  function set(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await callApi("/api/settings/grade-scale", "PUT", { bands: toBands(rows) });
    setSaving(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: "Grading scale saved." });
    router.refresh();
  }

  return (
    <div className="grade-scale">
      {isDefault && (
        <p className="take-hint">
          Using the default five-point scale. Saving any change makes it this organisation&rsquo;s own.
        </p>
      )}

      <div className="grade-scale-head">
        <span>Grade</span>
        <span>From (%)</span>
        <span>Grade point</span>
        <span />
      </div>

      {rows.map((row, index) => (
        <div className="grade-scale-row" key={index}>
          <input
            aria-label={`Grade label ${index + 1}`}
            value={row.label}
            maxLength={4}
            onChange={(e) => set(index, { label: e.target.value })}
          />
          <input
            aria-label={`Lowest percentage for grade ${row.label || index + 1}`}
            type="number"
            min={0}
            max={100}
            value={row.minPercent}
            onChange={(e) => set(index, { minPercent: e.target.value })}
          />
          <input
            aria-label={`Grade point for grade ${row.label || index + 1}`}
            type="number"
            min={0}
            max={10}
            step="0.5"
            value={row.gradePoint}
            onChange={(e) => set(index, { gradePoint: e.target.value })}
          />
          <button
            type="button"
            className="outline-button"
            aria-label={`Remove grade ${row.label || index + 1}`}
            disabled={rows.length === 1}
            onClick={() => {
              setRows((prev) => prev.filter((_, i) => i !== index));
              setMessage(null);
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {problems.length > 0 && (
        <ul className="grade-scale-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="grading-answer-actions">
        <button
          type="button"
          className="primary-button"
          disabled={saving || problems.length > 0}
          onClick={save}
        >
          {saving ? "Saving…" : "Save scale"}
        </button>
        <button
          type="button"
          className="outline-button"
          onClick={() => setRows((prev) => [...prev, { label: "", minPercent: "0", gradePoint: "0" }])}
        >
          Add band
        </button>
        {message && (
          <span className={message.tone === "ok" ? "form-message" : "take-error"} role="status">
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
