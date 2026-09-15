"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api";

export type ExamSettingsValue = {
  title: string;
  description: string | null;
  instructions: string | null;
  courseId: string | null;
  timeLimitMin: number | null;
  passMarkPct: number;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  navigation: "FREE" | "LINEAR";
  negativeMarking: boolean;
  releasePolicy: "IMMEDIATE" | "AFTER_CLOSE" | "MANUAL";
  reviewDetail: "SCORE_ONLY" | "BREAKDOWN" | "FULL";
  integrityLevel: number;
};

export const defaultExamSettings: ExamSettingsValue = {
  title: "",
  description: null,
  instructions: "Answer all questions. Your answers are saved automatically.",
  courseId: null,
  timeLimitMin: 60,
  passMarkPct: 50,
  maxAttempts: 1,
  shuffleQuestions: true,
  shuffleOptions: true,
  navigation: "FREE",
  negativeMarking: false,
  releasePolicy: "AFTER_CLOSE",
  reviewDetail: "SCORE_ONLY",
  integrityLevel: 0,
};

type Props = {
  examId?: string;
  initial: ExamSettingsValue;
  courses: { value: string; label: string }[];
};

export function ExamSettingsForm({ examId, initial, courses }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [timed, setTimed] = useState(initial.timeLimitMin !== null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof ExamSettingsValue>(key: K, next: ExamSettingsValue[K]) => setValue((v) => ({ ...v, [key]: next }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const body = { ...value, timeLimitMin: timed ? value.timeLimitMin ?? 60 : null, description: value.description || null, instructions: value.instructions || null };
    const result = examId
      ? await callApi<{ changed: string[] }>(`/api/exams/${examId}`, "PUT", body)
      : await callApi<{ exam: { id: string } }>("/api/exams", "POST", body);
    setPending(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    if (!examId) return router.push(`/exams/${(result.data as { exam: { id: string } }).exam.id}`);
    const changed = (result.data as { changed: string[] }).changed.length;
    setMessage({ tone: "ok", text: changed ? "Settings saved." : "No changes to save." });
    router.refresh();
  }

  return (
    <form className="question-form" onSubmit={submit}>
      <label>
        Exam title
        <input value={value.title} onChange={(e) => set("title", e.target.value)} required minLength={3} placeholder="e.g. CSC101 First Semester Examination" />
      </label>
      <label>
        Description <span className="field-hint">Shown on the candidate dashboard</span>
        <textarea value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
      </label>
      <label>
        Instructions <span className="field-hint">Shown before the exam starts</span>
        <textarea value={value.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} rows={3} />
      </label>
      <label>
        Course <span className="field-hint">Candidates registered on the course can sit the exam. Without a course, every candidate can.</span>
        <select value={value.courseId ?? ""} onChange={(e) => set("courseId", e.target.value || null)}>
          <option value="">No course (open to all candidates)</option>
          {courses.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      <fieldset className="editor-fieldset">
        <legend>Timing and attempts</legend>
        <div className="form-row three">
          <label>
            <span className="check-inline">
              <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Time limit (minutes)
            </span>
            <input type="number" min={1} max={600} value={timed ? value.timeLimitMin ?? 60 : ""} disabled={!timed} onChange={(e) => set("timeLimitMin", Number(e.target.value) || 1)} />
          </label>
          <label>
            Attempts allowed
            <input type="number" min={1} max={50} value={value.maxAttempts} onChange={(e) => set("maxAttempts", Number(e.target.value) || 1)} />
          </label>
          <label>
            Pass mark (%)
            <input type="number" min={0} max={100} value={value.passMarkPct} onChange={(e) => set("passMarkPct", Number(e.target.value))} />
          </label>
        </div>
        <label>
          Navigation
          <select value={value.navigation} onChange={(e) => set("navigation", e.target.value as ExamSettingsValue["navigation"])}>
            <option value="FREE">Free: candidates can move back and forth</option>
            <option value="LINEAR">Linear: no returning to earlier questions</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="editor-fieldset">
        <legend>Scoring and shuffling</legend>
        <div className="settings-list compact">
          <label className="check-label"><input type="checkbox" checked={value.shuffleQuestions} onChange={(e) => set("shuffleQuestions", e.target.checked)} /> Shuffle question order within each section</label>
          <label className="check-label"><input type="checkbox" checked={value.shuffleOptions} onChange={(e) => set("shuffleOptions", e.target.checked)} /> Shuffle answer options</label>
          <label className="check-label"><input type="checkbox" checked={value.negativeMarking} onChange={(e) => set("negativeMarking", e.target.checked)} /> Negative marking for wrong answers</label>
        </div>
      </fieldset>

      <fieldset className="editor-fieldset">
        <legend>Results</legend>
        <div className="form-row">
          <label>
            Release results
            <select value={value.releasePolicy} onChange={(e) => set("releasePolicy", e.target.value as ExamSettingsValue["releasePolicy"])}>
              <option value="IMMEDIATE">Immediately after submitting</option>
              <option value="AFTER_CLOSE">When the exam is closed</option>
              <option value="MANUAL">Manually by staff</option>
            </select>
          </label>
          <label>
            Candidates see
            <select value={value.reviewDetail} onChange={(e) => set("reviewDetail", e.target.value as ExamSettingsValue["reviewDetail"])}>
              <option value="SCORE_ONLY">Score only</option>
              <option value="BREAKDOWN">Score and section breakdown</option>
              <option value="FULL">Full review with answers</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="editor-fieldset">
        <legend>Integrity</legend>
        <label>
          Integrity level
          <select value={value.integrityLevel} onChange={(e) => set("integrityLevel", Number(e.target.value))}>
            <option value={0}>L0: passive logging only</option>
            <option value={1}>L1: fullscreen, blocked copy/paste, warnings</option>
            <option value={2}>L2: lockdown browser required</option>
            <option value={3}>L3: webcam checks</option>
            <option value={4}>L4: live invigilation</option>
          </select>
          <span className="field-hint">Levels above L0 only take effect when an administrator turns on proctoring for the organisation.</span>
        </label>
      </fieldset>

      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <div className="editor-actions">
        <button className="primary-button" disabled={pending}>{pending ? "Saving…" : examId ? "Save settings" : "Create exam"}<span>-&gt;</span></button>
      </div>
    </form>
  );
}
