"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";
import { weightProblems } from "@/server/grades/components";

type Row = { name: string; weightPct: string; examId: string };

export type ComponentValue = { name: string; weightPct: number; examId: string | null };

/**
 * Editing the CA/exam split for a course. Weights must add to 100, so the set is
 * saved whole rather than a row at a time.
 */
export function ComponentsForm({
  courseId,
  initial,
  exams,
}: {
  courseId: string;
  initial: ComponentValue[];
  exams: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    initial.map((c) => ({ name: c.name, weightPct: String(c.weightPct), examId: c.examId ?? "" })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const parsed = rows.map((row) => ({
    name: row.name,
    weightPct: Math.max(0, Math.min(100, Number(row.weightPct) || 0)),
    examId: row.examId || null,
  }));
  const problems = weightProblems(parsed);

  function set(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await callApi(`/api/courses/${courseId}/components`, "PUT", { components: parsed });
    setSaving(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: "Components saved." });
    router.refresh();
  }

  return (
    <section className="panel">
      <p className="eyebrow">ASSESSMENT</p>
      <h2>Components</h2>
      <p className="take-hint">
        How the final mark is made up — a continuous assessment and an exam, say. Weights must add
        to 100%.
      </p>

      <div className="component-list">
        {rows.map((row, index) => (
          <div className="component-row" key={index}>
            <input
              aria-label={`Component ${index + 1} name`}
              placeholder="e.g. Continuous assessment"
              value={row.name}
              maxLength={60}
              onChange={(e) => set(index, { name: e.target.value })}
            />
            <input
              aria-label={`Component ${index + 1} weight`}
              type="number"
              min={1}
              max={100}
              value={row.weightPct}
              onChange={(e) => set(index, { weightPct: e.target.value })}
            />
            <select
              aria-label={`Component ${index + 1} exam`}
              value={row.examId}
              onChange={(e) => set(index, { examId: e.target.value })}
            >
              <option value="">No exam yet</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.title}</option>
              ))}
            </select>
            <button
              type="button"
              className="outline-button"
              aria-label={`Remove component ${index + 1}`}
              onClick={() => {
                setRows((prev) => prev.filter((_, i) => i !== index));
                setMessage(null);
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {problems.length > 0 && (
        <ul className="grade-scale-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="grading-answer-actions">
        <button type="button" className="primary-button" disabled={saving || problems.length > 0} onClick={save}>
          {saving ? "Saving…" : "Save components"}
        </button>
        <button
          type="button"
          className="outline-button"
          onClick={() => setRows((prev) => [...prev, { name: "", weightPct: "", examId: "" }])}
        >
          Add component
        </button>
        {message && (
          <span className={message.tone === "ok" ? "form-message" : "take-error"} role="status">
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}
