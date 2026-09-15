"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, X, XCircle } from "lucide-react";
import { candidateView, createLayout, parseAuthoredItem, scoreItem } from "@/items/registry";
import { defaultItem } from "@/items/defaults";
import { ItemPlayer } from "@/items/players";
import { typeFields } from "./type-fields";

export type SubjectOption = { id: string; name: string; topics: { id: string; name: string }[] };

export type EditorInput = {
  type: string;
  content: { text: string; assetIds: string[] };
  interaction: unknown;
  scoring: unknown;
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  points: number;
  timeEstimateSec: number | null;
  subjectId: string | null;
  topicId: string | null;
};

type Props = {
  questionId?: string;
  initial?: EditorInput;
  status?: string;
  types: { key: string; label: string; description: string }[];
  subjects: SubjectOption[];
  canReview: boolean;
  lockedType?: boolean;
};

type Bag = Record<string, unknown>;

export function QuestionEditor({ questionId, initial, status, types, subjects: initialSubjects, canReview, lockedType }: Props) {
  const router = useRouter();
  const [type, setType] = useState(initial?.type ?? types[0].key);
  const [text, setText] = useState(initial?.content.text ?? "");
  const [assetIds, setAssetIds] = useState<string[]>(initial?.content.assetIds ?? []);
  const [item, setItem] = useState<{ interaction: Bag; scoring: Bag }>(() =>
    initial ? { interaction: initial.interaction as Bag, scoring: initial.scoring as Bag } : defaultItem(types[0].key),
  );
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [difficulty, setDifficulty] = useState<EditorInput["difficulty"]>(initial?.difficulty ?? "MEDIUM");
  const [points, setPoints] = useState(initial?.points ?? 1);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [topicId, setTopicId] = useState(initial?.topicId ?? "");
  const [previewValue, setPreviewValue] = useState<unknown>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => parseAuthoredItem(type, item.interaction, item.scoring), [type, item]);
  const errors = [...(text.trim() ? [] : ["Write the question."]), ...(validation.ok ? [] : validation.errors)];

  const preview = useMemo(() => {
    if (!validation.ok) return null;
    try {
      const layout = createLayout(type, validation.value.interaction, false);
      return candidateView(type, validation.value.interaction, layout);
    } catch {
      return null;
    }
  }, [type, validation]);

  const checkResult = useMemo(() => {
    if (!checked || !validation.ok) return null;
    return scoreItem(type, { interaction: validation.value.interaction, scoring: validation.value.scoring, response: previewValue }, { maxPoints: points, negativeMarking: false });
  }, [checked, points, previewValue, type, validation]);

  const topics = subjects.find((s) => s.id === subjectId)?.topics ?? [];
  const Fields = typeFields[type];

  function changeType(next: string) {
    setType(next);
    setItem(defaultItem(next));
    setPreviewValue(null);
    setChecked(false);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: form }).catch(() => null);
      const data = await res?.json().catch(() => ({}));
      if (!res?.ok) {
        setMessage({ tone: "error", text: data?.error ?? `Could not upload ${file.name}.` });
        break;
      }
      setAssetIds((ids) => (ids.includes(data.asset.id) ? ids : [...ids, data.asset.id]));
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function addSubject() {
    const name = window.prompt("New subject name");
    if (!name?.trim()) return;
    const res = await fetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ tone: "error", text: data.error ?? "Could not add the subject." });
    setSubjects((list) => [...list, data.subject].sort((a, b) => a.name.localeCompare(b.name)));
    setSubjectId(data.subject.id);
    setTopicId("");
  }

  async function addTopic() {
    if (!subjectId) return;
    const name = window.prompt("New topic name");
    if (!name?.trim()) return;
    const res = await fetch(`/api/subjects/${subjectId}/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ tone: "error", text: data.error ?? "Could not add the topic." });
    setSubjects((list) => list.map((s) => (s.id === subjectId ? { ...s, topics: [...s.topics, data.topic].sort((a, b) => a.name.localeCompare(b.name)) } : s)));
    setTopicId(data.topic.id);
  }

  async function save(nextStatus: string, event?: FormEvent) {
    event?.preventDefault();
    if (errors.length) {
      setMessage({ tone: "error", text: errors[0] });
      return;
    }
    setSaving(true);
    setMessage(null);
    const body = {
      type,
      content: { text, assetIds },
      interaction: item.interaction,
      scoring: item.scoring,
      explanation: explanation || null,
      difficulty,
      points,
      subjectId: subjectId || null,
      topicId: topicId || null,
      status: nextStatus,
    };
    const res = await fetch(questionId ? `/api/questions/${questionId}` : "/api/questions", {
      method: questionId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) {
      setMessage({ tone: "error", text: data?.error ?? "Could not save. Check your connection and try again." });
      return;
    }
    if (!questionId) {
      router.push(`/questions/${data.question.id}?saved=1`);
      return;
    }
    setMessage({ tone: "ok", text: data.question.changed === false ? "No changes to save." : `Saved as version ${data.question.version} (${String(data.question.status).replace("_", " ").toLowerCase()}).` });
    router.refresh();
  }

  async function remove() {
    if (!questionId || !window.confirm("Delete this question? This cannot be undone.")) return;
    const res = await fetch(`/api/questions/${questionId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ tone: "error", text: data.error ?? "Could not delete the question." });
    router.push("/questions");
    router.refresh();
  }

  return (
    <section className="editor-layout">
      <form className="question-form" onSubmit={(e) => save(status === "APPROVED" ? "APPROVED" : status ?? "DRAFT", e)}>
        <div className="form-heading">
          <div>
            <p className="eyebrow">{questionId ? "EDIT QUESTION" : "NEW QUESTION"}</p>
            <h2>{types.find((t) => t.key === type)?.label}</h2>
          </div>
          <span className="draft-label">{(status ?? "DRAFT").replace("_", " ")}</span>
        </div>

        <label>
          Question type
          <select value={type} onChange={(e) => changeType(e.target.value)} disabled={lockedType}>
            {types.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <span className="field-hint">{lockedType ? "The type cannot change once a question has been answered or used in an exam." : types.find((t) => t.key === type)?.description}</span>
        </label>

        <label>
          Question
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Write the question candidates will see…" required />
        </label>

        <div className="editor-images">
          {assetIds.map((id) => (
            <figure key={id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served from the app's own asset route */}
              <img src={`/api/assets/${id}`} alt="" />
              <button type="button" aria-label="Remove image" onClick={() => setAssetIds((ids) => ids.filter((x) => x !== id))}><X size={12} /></button>
            </figure>
          ))}
          <button type="button" className="outline-button" onClick={() => fileInput.current?.click()} disabled={uploading || assetIds.length >= 10}>
            {uploading ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} Add image
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>

        {Fields && <Fields interaction={item.interaction} scoring={item.scoring} onChange={(interaction, scoring) => { setItem({ interaction, scoring }); setChecked(false); }} />}

        <div className="form-row">
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as EditorInput["difficulty"])}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>
          <label>
            Marks
            <input type="number" min={0.25} max={100} step={0.25} value={points} onChange={(e) => setPoints(Number(e.target.value) || 1)} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Subject <button type="button" className="link-button inline" onClick={addSubject}>+ New</button>
            <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }}>
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Topic {subjectId && <button type="button" className="link-button inline" onClick={addTopic}>+ New</button>}
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId}>
              <option value="">No topic</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Explanation <span className="field-hint">Shown to candidates in review when the exam allows it</span>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
        </label>

        {errors.length > 0 && (
          <ul className="editor-errors" aria-live="polite">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}

        <div className="editor-actions">
          <button type="button" className="outline-button" disabled={saving} onClick={() => save("DRAFT")}>Save draft</button>
          <button type="button" className="secondary-button" disabled={saving} onClick={() => save("IN_REVIEW")}>Submit for review</button>
          {canReview && (
            <button type="button" className="primary-button" disabled={saving} onClick={() => save("APPROVED")}>
              {saving ? "Saving…" : "Save & approve"}<span>-&gt;</span>
            </button>
          )}
          {questionId && <button type="button" className="danger-button" onClick={remove}>Delete</button>}
          <Link className="text-button" href="/questions">Cancel</Link>
        </div>
      </form>

      <aside className="editor-preview">
        <p className="eyebrow">CANDIDATE PREVIEW</p>
        <div className="player-card preview-card">
          <div className="take-q-head">
            <span className="take-index">Question 1</span>
            <span className="take-points">{points} mark{points === 1 ? "" : "s"}</span>
          </div>
          <h2 className="player-prompt" id="preview-prompt">{text || "Your question will appear here."}</h2>
          {assetIds.length > 0 && (
            <div className="prompt-images">
              {assetIds.map((id) => (
                // eslint-disable-next-line @next/next/no-img-element -- served from the app's own asset route
                <img key={id} src={`/api/assets/${id}`} alt="" />
              ))}
            </div>
          )}
          {preview ? (
            <ItemPlayer type={type} view={preview} value={previewValue} name="preview" labelledBy="preview-prompt" onChange={(v) => { setPreviewValue(v); setChecked(false); }} />
          ) : (
            <p className="take-hint">Complete the answer settings to see the preview.</p>
          )}
          {preview !== null && (
            <div className="preview-check">
              <button type="button" className="outline-button" onClick={() => setChecked(true)}>Check answer</button>
              {checkResult && (
                <span className={checkResult.isCorrect ? "score-pass" : "score-fail"}>
                  {checkResult.needsManualGrading ? (
                    "Would go to a grader"
                  ) : checkResult.isCorrect ? (
                    <><CheckCircle2 size={14} /> Correct · {checkResult.points} marks</>
                  ) : (
                    <><XCircle size={14} /> {checkResult.points} of {checkResult.maxPoints} marks</>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <p className="take-hint">Options appear in this order unless the exam shuffles them. Pinned options keep their place.</p>
      </aside>
    </section>
  );
}
