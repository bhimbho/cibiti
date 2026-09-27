"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

/**
 * The banner shown while an administrator is viewing as someone else. Deliberately
 * loud and on every page: the whole risk of this feature is forgetting it is on.
 */
export function ViewingAsBanner({ name, realName }: { name: string; realName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <div className="view-as-banner" role="status">
      <span>
        Viewing as <strong>{name}</strong> — read-only. You are signed in as {realName}.
      </span>
      <button
        type="button"
        className="view-as-stop"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await callApi("/api/impersonation", "DELETE");
          setPending(false);
          router.push("/people");
          router.refresh();
        }}
      >
        {pending ? "Stopping…" : "Stop viewing as them"}
      </button>
    </div>
  );
}
