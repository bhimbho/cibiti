"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

export function ReleaseButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="secondary-button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await callApi("/api/results/release", "POST", { attemptIds: [attemptId] });
          setPending(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
      >
        {pending ? "Releasing…" : "Release result"}
      </button>
      {error && <span className="score-fail">{error}</span>}
    </>
  );
}
