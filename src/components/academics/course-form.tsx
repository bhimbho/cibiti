"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/components/exam-builder/api";

type Option = { value: string; label: string };
export type CourseValue = { code: string; title: string; credits: number; departmentId: string | null; levelId: string | null };

export function CourseForm({ courseId, initial, departments, levels, compact }: { courseId?: string; initial?: CourseValue; departments: Option[]; levels: Option[]; compact?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const el = event.currentTarget;
    const form = new FormData(el);
    setPending(true);
    setMessage(null);
    const body = {
      code: String(form.get("code") ?? ""),
      title: String(form.get("title") ?? ""),
      credits: Number(form.get("credits") || 0),
      departmentId: String(form.get("departmentId") || "") || null,
      levelId: String(form.get("levelId") || "") || null,
    };
    const result = courseId ? await callApi(`/api/courses/${courseId}`, "PUT", body) : await callApi<{ course: { id: string } }>("/api/courses", "POST", body);
    setPending(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: courseId ? "Course saved." : `${body.code.toUpperCase()} added.` });
    if (!courseId) el.reset();
    router.refresh();
  }

  return (
    <form className={`question-form ${compact ? "course-form-compact" : ""}`} onSubmit={submit}>
      {!courseId && <div className="form-heading"><div><p className="eyebrow">NEW COURSE</p><h2>Add a course</h2></div></div>}
      <div className="form-row">
        <label>Code<input name="code" defaultValue={initial?.code} required minLength={2} maxLength={20} placeholder="e.g. CSC201" /></label>
        <label>Credits / units<input name="credits" type="number" min={0} max={30} defaultValue={initial?.credits ?? 3} /></label>
      </div>
      <label>Title<input name="title" defaultValue={initial?.title} required minLength={3} placeholder="e.g. Data Structures" /></label>
      <div className="form-row">
        <label>
          Department
          <select name="departmentId" defaultValue={initial?.departmentId ?? ""}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label>
          Level
          <select name="levelId" defaultValue={initial?.levelId ?? ""}>
            <option value="">None</option>
            {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
      </div>
      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <div className="editor-actions">
        <button className="primary-button" disabled={pending}>{pending ? "Saving…" : courseId ? "Save course" : "Add course"}<span>-&gt;</span></button>
      </div>
    </form>
  );
}
