"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImpersonationMode } from "@prisma/client";
import { callApi } from "@/components/exam-builder/api";

/**
 * How much "view as a user" allows. Saved as it is changed, like the switches around
 * it. Turning editing on is the kind of decision worth confirming once.
 */
export function ImpersonationModeForm({ mode, isDefault }: { mode: ImpersonationMode; isDefault: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<ImpersonationMode>(mode);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const editing = value === "EDIT";

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
    const previous = value;
    setValue(next);
    setPending(true);
    setMessage(null);
    const result = await callApi("/api/settings/impersonation", "PUT", { mode: next });
    setPending(false);
    if (!result.ok) {
      setValue(previous);
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setMessage({ tone: "ok", text: next === "EDIT" ? "Editing allowed while viewing as a user." : "Viewing is read-only again." });
    router.refresh();
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

      {message && (
        <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
