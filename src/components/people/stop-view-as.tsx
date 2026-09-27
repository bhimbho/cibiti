"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

/**
 * The banner shown while an administrator is viewing as someone else. Deliberately
 * loud and on every page: the whole risk of this feature is forgetting it is on.
 */
export function ViewingAsBanner({
  name,
  realName,
  canEdit,
}: {
  name: string;
  realName: string;
  /** True when the organisation allows changes while viewing. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    // Louder in edit mode: anything typed here lands on the real account.
    <div className={`view-as-banner ${canEdit ? "editing" : ""}`} role="status">
      <span>
        {canEdit ? "Editing as " : "Viewing as "}
        <strong>{name}</strong>
        {canEdit ? " — changes are saved to their account" : " — read-only"}. You are signed in as {realName}.
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
