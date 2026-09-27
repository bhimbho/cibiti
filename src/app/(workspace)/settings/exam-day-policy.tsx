"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";
import type { ExamDayPolicy } from "@/server/exam-day/policy";

type Field = keyof ExamDayPolicy;

/**
 * Exam-day recovery settings. Each control saves as it is changed, like the feature
 * switches below — there is no Save button to forget. A failed save puts the control
 * back where it was, so the screen never claims a setting that is not stored.
 */
export function ExamDayPolicyForm({ policy, isDefault }: { policy: ExamDayPolicy; isDefault: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<ExamDayPolicy>(policy);
  const [pending, setPending] = useState<Field | null>(null);
  const [saved, setSaved] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: ExamDayPolicy, field: Field) {
    const previous = value;
    setValue(next);
    setPending(field);
    setError(null);
    const result = await callApi("/api/settings/exam-day", "PUT", next);
    setPending(null);
    if (!result.ok) {
      // Never leave a switch showing a state the server refused.
      setValue(previous);
      setError(result.error);
      return;
    }
    setSaved(field);
    router.refresh();
  }

  function toggle(field: "allowRestart" | "invigilatorCanRestart" | "invigilatorCanExtend") {
    const next = { ...value, [field]: !value[field] };
    // Switching restarting off drops the invigilator permission with it, rather than
    // leaving a setting that grants something already forbidden.
    if (field === "allowRestart" && !next.allowRestart) next.invigilatorCanRestart = false;
    void save(next, field);
  }

  /** Numbers commit when the field is left, since saving each keystroke would save nonsense. */
  function commitNumber(field: "maxRestartsPerCandidate" | "maxExtraMinutesPerAttempt", raw: string) {
    const bounds = field === "maxRestartsPerCandidate" ? { min: 1, max: 10 } : { min: 0, max: 480 };
    const parsed = Number(raw);
    if (raw.trim() === "" || Number.isNaN(parsed)) {
      setValue((prev) => ({ ...prev, [field]: policy[field] }));
      return;
    }
    const clamped = Math.max(bounds.min, Math.min(bounds.max, Math.round(parsed)));
    if (clamped === policy[field] && clamped === value[field]) return;
    void save({ ...value, [field]: clamped }, field);
  }

  const note = (field: Field) => (pending === field ? "Saving…" : saved === field ? "Saved" : null);

  return (
    <div className="policy-form">
      {isDefault && <p className="take-hint">Using the default policy: time can be added, exams cannot be restarted.</p>}
      {error && <p className="take-error" role="status">{error}</p>}

      <div className="flag-row">
        <div>
          <strong>Allow exams to be restarted</strong>
          <p>
            Voids a candidate&rsquo;s attempt so they can sit again with a fresh paper. Their answers
            and timing stay on record. With this off, nobody can restart — administrators included.
          </p>
        </div>
        <span className="policy-state">
          {note("allowRestart") && <small className="take-hint">{note("allowRestart")}</small>}
          <button
            type="button"
            role="switch"
            aria-checked={value.allowRestart}
            aria-label="Allow exams to be restarted"
            className={`switch ${value.allowRestart ? "on" : ""}`}
            disabled={pending !== null}
            onClick={() => toggle("allowRestart")}
          >
            <span />
          </button>
        </span>
      </div>

      <div className="flag-row">
        <div>
          <strong>Invigilators may restart</strong>
          <p>
            Otherwise only exam officers and administrators can, and an invigilator must ask.
            {!value.allowRestart && " Turn restarting on first."}
          </p>
        </div>
        <span className="policy-state">
          {note("invigilatorCanRestart") && <small className="take-hint">{note("invigilatorCanRestart")}</small>}
          <button
            type="button"
            role="switch"
            aria-checked={value.invigilatorCanRestart}
            aria-label="Invigilators may restart"
            className={`switch ${value.invigilatorCanRestart ? "on" : ""}`}
            // Unreachable rather than refused: this permission means nothing while
            // restarting is switched off.
            disabled={pending !== null || !value.allowRestart}
            onClick={() => toggle("invigilatorCanRestart")}
          >
            <span />
          </button>
        </span>
      </div>

      <div className="flag-row">
        <div>
          <strong>Invigilators may add time</strong>
          <p>Exam officers and administrators always may.</p>
        </div>
        <span className="policy-state">
          {note("invigilatorCanExtend") && <small className="take-hint">{note("invigilatorCanExtend")}</small>}
          <button
            type="button"
            role="switch"
            aria-checked={value.invigilatorCanExtend}
            aria-label="Invigilators may add time"
            className={`switch ${value.invigilatorCanExtend ? "on" : ""}`}
            disabled={pending !== null}
            onClick={() => toggle("invigilatorCanExtend")}
          >
            <span />
          </button>
        </span>
      </div>

      <div className="form-row">
        <label>
          Restarts per candidate, per exam
          <span className="field-hint">{note("maxRestartsPerCandidate") ?? "Saved when you leave the field."}</span>
          <input
            type="number"
            min={1}
            max={10}
            value={value.maxRestartsPerCandidate}
            disabled={pending !== null}
            onChange={(e) => setValue((prev) => ({ ...prev, maxRestartsPerCandidate: Number(e.target.value) }))}
            onBlur={(e) => commitNumber("maxRestartsPerCandidate", e.target.value)}
          />
        </label>
        <label>
          Most added time per attempt (minutes)
          <span className="field-hint">
            {note("maxExtraMinutesPerAttempt") ?? "0 switches added time off entirely."}
          </span>
          <input
            type="number"
            min={0}
            max={480}
            value={value.maxExtraMinutesPerAttempt}
            disabled={pending !== null}
            onChange={(e) => setValue((prev) => ({ ...prev, maxExtraMinutesPerAttempt: Number(e.target.value) }))}
            onBlur={(e) => commitNumber("maxExtraMinutesPerAttempt", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
