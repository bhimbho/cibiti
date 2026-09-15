"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";
import { PasswordReveal } from "./person-form";

export function ResetPassword({ userId, signIn }: { userId: string; signIn: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (password) return <PasswordReveal signIn={signIn} password={password} />;

  return (
    <div>
      <p className="take-hint">Generates a new password and shows it once. The old password stops working immediately.</p>
      <button
        type="button"
        className="outline-button"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm("Reset this person's password?")) return;
          setPending(true);
          const result = await callApi<{ password: string }>(`/api/people/${userId}/password`, "POST");
          setPending(false);
          if (result.ok) setPassword(result.data.password);
          else setError(result.error);
        }}
      >
        {pending ? "Resetting…" : "Reset password"}
      </button>
      {error && <p className="take-error">{error}</p>}
    </div>
  );
}

export function AccommodationForm({ userId, initial }: { userId: string; initial: { extraTimePct: number; notes: string | null } }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await callApi(`/api/people/${userId}/accommodation`, "PUT", {
      extraTimePct: Number(form.get("extraTimePct")),
      notes: String(form.get("notes") ?? "") || null,
    });
    setMessage(result.ok ? { tone: "ok", text: "Accommodation saved. It applies to exams started from now on." } : { tone: "error", text: result.error });
    if (result.ok) router.refresh();
  }

  return (
    <form className="accommodation-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Extra time
          <select name="extraTimePct" defaultValue={String(initial.extraTimePct)}>
            {[0, 10, 25, 33, 50, 100].map((pct) => (
              <option key={pct} value={pct}>{pct === 0 ? "None" : `+${pct}%`}</option>
            ))}
          </select>
        </label>
        <label>Notes<input name="notes" defaultValue={initial.notes ?? ""} maxLength={500} placeholder="e.g. Approved by Student Affairs" /></label>
      </div>
      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"}>{message.text}</p>}
      <button className="secondary-button">Save accommodation</button>
    </form>
  );
}
