"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

type Flag = { key: string; label: string; description: string; enabled: boolean; examOverrides: number };

export function FlagToggles({ flags }: { flags: Flag[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(flag: Flag) {
    const next = !flag.enabled;
    if (!window.confirm(`${next ? "Turn on" : "Turn off"} "${flag.label}" for the whole organisation?`)) return;
    setPending(flag.key);
    setError(null);
    const result = await callApi("/api/settings/flags", "PUT", { key: flag.key, enabled: next });
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flag-list">
      {flags.map((flag) => (
        <div className="flag-row" key={flag.key}>
          <div>
            <strong>{flag.label}</strong>
            <p>{flag.description}</p>
            {flag.examOverrides > 0 && <small className="take-hint">Also switched on for {flag.examOverrides} individual exam{flag.examOverrides === 1 ? "" : "s"}.</small>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={flag.enabled}
            aria-label={flag.label}
            className={`switch ${flag.enabled ? "on" : ""}`}
            disabled={pending === flag.key}
            onClick={() => toggle(flag)}
          >
            <span />
          </button>
        </div>
      ))}
      {error && <p className="take-error">{error}</p>}
    </div>
  );
}
