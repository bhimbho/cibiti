"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/exam-builder/api";
import type { GradingItem } from "@/server/grading/queue";

/** The candidate's answer as text. Short answers carry `{ text }`; anything else
 *  is shown as its raw value rather than hidden behind "unsupported". */
function answerText(response: unknown): string {
  if (response === null || response === undefined) return "";
  if (typeof response === "string") return response;
  if (typeof response === "object" && "text" in (response as Record<string, unknown>)) {
    return String((response as { text?: unknown }).text ?? "");
  }
  return JSON.stringify(response, null, 2);
}

/** The authored answer key, so the marker can see what was expected. */
function expectedAnswers(scoring: unknown): string[] {
  if (scoring && typeof scoring === "object" && "acceptedAnswers" in scoring) {
    const accepted = (scoring as { acceptedAnswers?: unknown }).acceptedAnswers;
    if (Array.isArray(accepted)) return accepted.map(String);
  }
  return [];
}

function MarkRow({ item, onMarked }: { item: GradingItem; onMarked: () => void }) {
  const [points, setPoints] = useState(item.points === null ? "" : String(item.points));
  const [comment, setComment] = useState(item.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const answer = answerText(item.response);
  const expected = expectedAnswers(item.scoring);

  async function save() {
    const parsed = Number(points);
    if (points.trim() === "" || Number.isNaN(parsed)) {
      setError(`Enter a mark between 0 and ${item.maxPoints}.`);
      return;
    }
    setState("saving");
    setError(null);
    const result = await callApi(`/api/grading/items/${item.id}`, "PUT", {
      points: parsed,
      comment: comment.trim() || null,
    });
    if (!result.ok) {
      setState("idle");
      setError(result.error);
      return;
    }
    setState("saved");
    onMarked();
  }

  return (
    <div className="panel grading-answer">
      <header className="grading-answer-head">
        <strong>{item.candidate ?? "Anonymous"}</strong>
        {item.regNumber && <span className="field-hint">{item.regNumber}</span>}
        {item.graded && <span className="status-pill e-closed">Marked</span>}
      </header>

      <blockquote className="grading-answer-body">{answer || <em>No answer given</em>}</blockquote>

      {expected.length > 0 && (
        <p className="field-hint">Answer key: {expected.join(" · ")}</p>
      )}
      {item.explanation && <p className="field-hint">Note: {item.explanation}</p>}

      <div className="form-row">
        <label>
          Mark (out of {item.maxPoints})
          <input
            type="number"
            min={0}
            max={item.maxPoints}
            step="0.25"
            value={points}
            onChange={(e) => {
              setPoints(e.target.value);
              setState("idle");
            }}
          />
        </label>
        <label>
          Comment for the candidate
          <input
            type="text"
            value={comment}
            maxLength={2000}
            placeholder="Optional"
            onChange={(e) => {
              setComment(e.target.value);
              setState("idle");
            }}
          />
        </label>
      </div>

      <div className="grading-answer-actions">
        <button type="button" className="primary-button" disabled={state === "saving"} onClick={save}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save mark"}
        </button>
        {/* Full marks and zero are the common cases; typing them every time is friction. */}
        <button type="button" className="outline-button" disabled={state === "saving"} onClick={() => setPoints(String(item.maxPoints))}>
          Full marks
        </button>
        <button type="button" className="outline-button" disabled={state === "saving"} onClick={() => setPoints("0")}>
          Zero
        </button>
        {error && <span className="take-error">{error}</span>}
      </div>
    </div>
  );
}

export function MarkingPane({ items }: { items: GradingItem[] }) {
  const router = useRouter();
  const [done, setDone] = useState(0);

  return (
    <>
      {/* Above the list, because a marked answer leaves the unmarked list: with the
          confirmation inside a row, finishing the last one showed an empty screen
          and no sign the mark had been recorded. */}
      {done > 0 && (
        <p className="form-message" role="status">
          {done} mark{done === 1 ? "" : "s"} saved. An attempt is totalled and closed once its last answer is marked.
        </p>
      )}
      {items.length === 0 ? (
        <p className="take-loading">Nothing left to mark for this question.</p>
      ) : (
        <div className="grading-list">
          {items.map((item) => (
            <MarkRow
              key={item.id}
              item={item}
              onMarked={() => {
                setDone((n) => n + 1);
                // Refresh so the queue counts and the attempt's status catch up.
                router.refresh();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
