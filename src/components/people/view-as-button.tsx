"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";

/**
 * Start viewing the app as this user. No password is needed and none is revealed —
 * the administrator's own session stays in place and the view is read-only.
 */
export function ViewAsButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="secondary-button view-as-button"
        disabled={pending}
        onClick={async () => {
          setError(null);
          if (!window.confirm(`See the app as ${name} sees it? You stay signed in as yourself, and nothing can be changed while you look.`)) return;
          setPending(true);
          const result = await callApi("/api/impersonation", "POST", { userId });
          setPending(false);
          if (!result.ok) return setError(result.error);
          // Straight to their home screen, which is the point of looking.
          router.push("/");
          router.refresh();
        }}
      >
        <Eye size={14} aria-hidden />
        {pending ? "Opening…" : "View as this user"}
      </button>
      {error && <p className="take-error">{error}</p>}
    </>
  );
}
