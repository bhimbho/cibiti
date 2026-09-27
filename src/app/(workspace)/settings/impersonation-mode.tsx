"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImpersonationMode } from "@prisma/client";
import { callApi } from "@/components/exam-builder/api";

/**
 * How much "view as a user" allows. Saved as it is changed, like the switches around
 * it. Turning editing on is the kind of decision worth confirming once.
 */
export function ImpersonationModeForm({
  mode,
  allowExamActions,
  isDefault,
}: {
  mode: ImpersonationMode;
  allowExamActions: boolean;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<ImpersonationMode>(mode);
  const [exams, setExams] = useState(allowExamActions);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const editing = value === "EDIT";

  async function save(nextMode: ImpersonationMode, nextExams: boolean, note: string) {
    const previous = { mode: value, exams };
    setValue(nextMode);
    setExams(nextExams);
    setPending(true);
    setMessage(null);
    const result = await callApi("/api/settings/impersonation", "PUT", {
      mode: nextMode,
      allowExamActions: nextExams,
    });
    setPending(false);
    if (!result.ok) {
      setValue(previous.mode);
      setExams(previous.exams);
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setMessage({ tone: "ok", text: note });
    router.refresh();
  }

  async function toggleExamActions() {
    const next = !exams;
    if (
      next &&
      !window.confirm(
        "Allow staff to answer and submit exams while viewing as a user? This is for testing a delivery flow. Any attempt touched this way is permanently marked as staff-assisted and shows a warning on its report.",
      )
    ) {
      return;
    }
    await save(
      value,
      next,
      next ? "Staff can answer exams while viewing as a user." : "Answering exams while viewing is off again.",
    );
  }

  async function toggle() {
    const next: ImpersonationMode = editing ? "READ_ONLY" : "EDIT";
    if (
      next === "EDIT" &&
      !window.confirm(
        "Let administrators change data while viewing as another user? Their edits will be recorded as that user's, with the administrator named alongside. Sitting an exam stays impossible either way.",
      )
    ) {
      return;
    }
    await save(
      next,
      // Answering exams means nothing without editing, so it goes off with it.
      next === "EDIT" ? exams : false,
      next === "EDIT" ? "Editing allowed while viewing as a user." : "Viewing is read-only again.",
    );
  }

  return (
    <div className="policy-form">
      {isDefault && <p className="take-hint">Using the default: viewing as a user shows everything and changes nothing.</p>}

      <div className="flag-row">
        <div>
          <strong>Allow editing while viewing as a user</strong>
          <p>
            With this off, a view is read-only: every attempt to change something is refused. With it
            on, an administrator can act as the user to fix something in place — each change recorded
            as that user&rsquo;s, with the administrator named alongside it in the audit log.
            Answering or submitting a candidate&rsquo;s exam is refused either way.
          </p>
        </div>
        <span className="policy-state">
          {pending && <small className="take-hint">Saving…</small>}
          <button
            type="button"
            role="switch"
            aria-checked={editing}
            aria-label="Allow editing while viewing as a user"
            className={`switch ${editing ? "on" : ""}`}
            disabled={pending}
            onClick={toggle}
          >
            <span />
          </button>
        </span>
      </div>

      <div className="flag-row">
        <div>
          <strong>Allow answering and submitting exams (testing)</strong>
          <p>
            For walking a delivery flow end to end as a candidate. Every attempt touched this way is
            permanently marked as staff-assisted — on the attempt, in its integrity timeline, and on
            its report — so a test submission cannot be mistaken for a candidate&rsquo;s own work.
            {!editing && " Editing must be on first."}
          </p>
        </div>
        <span className="policy-state">
          {pending && <small className="take-hint">Saving…</small>}
          <button
            type="button"
            role="switch"
            aria-checked={exams}
            aria-label="Allow answering and submitting exams"
            className={`switch ${exams ? "on" : ""}`}
            disabled={pending || !editing}
            onClick={toggleExamActions}
          >
            <span />
          </button>
        </span>
      </div>

      {message && (
        <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
