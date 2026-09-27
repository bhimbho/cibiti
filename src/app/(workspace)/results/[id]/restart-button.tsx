"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

/**
 * Restart from the attempt report, for the case the invigilation console cannot
 * reach: an attempt already submitted — force-submitted after a machine died, say —
 * where the candidate still needs to sit the paper.
 */
export function RestartButton({
  attemptId,
  candidate,
  withdrawsResult = false,
}: {
  attemptId: string;
  candidate: string;
  /** The candidate can already see this result, so restarting takes it back. */
  withdrawsResult?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="outline-button"
        disabled={pending}
        onClick={async () => {
          setError(null);
          const warning = withdrawsResult
            ? ` ${candidate} can already see this result, and restarting withdraws it.`
            : "";
          if (!window.confirm(`Restart ${candidate}'s exam? This attempt is voided and they sit again with a new paper.${warning}`)) return;
          const reason = window.prompt("Reason (e.g. machine failed, power cut):");
          if (!reason?.trim()) return;
          setPending(true);
          const result = await callApi(`/api/attempts/${attemptId}/restart`, "POST", { reason });
          setPending(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
      >
        {pending ? "Restarting…" : "Restart exam"}
      </button>
      {error && <span className="score-fail">{error}</span>}
    </>
  );
}
