"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

export function DeleteCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="exam-detail-actions">
      <button
        type="button"
        className="danger-button"
        onClick={async () => {
          if (!window.confirm("Delete this course and its registrations? This cannot be undone.")) return;
          const result = await callApi(`/api/courses/${courseId}`, "DELETE");
          if (!result.ok) return setError(result.error);
          router.push("/academics/courses");
          router.refresh();
        }}
      >
        Delete course
      </button>
      {error && <span className="score-fail">{error}</span>}
    </div>
  );
}
