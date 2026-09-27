"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";
import { policyProblems, type ExamDayPolicy } from "@/server/exam-day/policy";

/**
 * Exam-day recovery settings. Restarting is off by default and switched on
 * deliberately, because it destroys a candidate's work.
 */
export function ExamDayPolicyForm({ policy, isDefault }: { policy: ExamDayPolicy; isDefault: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<ExamDayPolicy>(policy);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const problems = policyProblems(value);

  function set<K extends keyof ExamDayPolicy>(key: K, next: ExamDayPolicy[K]) {
    setValue((prev) => ({ ...prev, [key]: next }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await callApi("/api/settings/exam-day", "PUT", value);
    setSaving(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: "Exam-day policy saved." });
    router.refresh();
  }

  return (
    <div className="policy-form">
      {isDefault && <p className="take-hint">Using the default policy: time can be added, exams cannot be restarted.</p>}

      <div className="flag-row">
        <div>
          <strong>Allow exams to be restarted</strong>
          <p>
            Voids a candidate&rsquo;s attempt so they can sit again with a fresh paper. Their answers
            and timing stay on record. With this off, nobody can restart — administrators included.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.allowRestart}
          aria-label="Allow exams to be restarted"
          className={`switch ${value.allowRestart ? "on" : ""}`}
          onClick={() => set("allowRestart", !value.allowRestart)}
        >
          <span />
        </button>
      </div>

      <div className="flag-row">
        <div>
          <strong>Invigilators may restart</strong>
          <p>Otherwise only exam officers and administrators can, and an invigilator must ask.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.invigilatorCanRestart}
          aria-label="Invigilators may restart"
          className={`switch ${value.invigilatorCanRestart ? "on" : ""}`}
          onClick={() => set("invigilatorCanRestart", !value.invigilatorCanRestart)}
        >
          <span />
        </button>
      </div>

      <div className="flag-row">
        <div>
          <strong>Invigilators may add time</strong>
          <p>Exam officers and administrators always may.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.invigilatorCanExtend}
          aria-label="Invigilators may add time"
          className={`switch ${value.invigilatorCanExtend ? "on" : ""}`}
          onClick={() => set("invigilatorCanExtend", !value.invigilatorCanExtend)}
        >
          <span />
        </button>
      </div>

      <div className="form-row">
        <label>
          Restarts per candidate, per exam
          <input
            type="number"
            min={1}
            max={10}
            value={value.maxRestartsPerCandidate}
            onChange={(e) => set("maxRestartsPerCandidate", Number(e.target.value) || 1)}
          />
        </label>
        <label>
          Most added time per attempt (minutes)
          <span className="field-hint">0 switches added time off entirely.</span>
          <input
            type="number"
            min={0}
            max={480}
            value={value.maxExtraMinutesPerAttempt}
            onChange={(e) => set("maxExtraMinutesPerAttempt", Number(e.target.value) || 0)}
          />
        </label>
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
          {saving ? "Saving…" : "Save policy"}
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
