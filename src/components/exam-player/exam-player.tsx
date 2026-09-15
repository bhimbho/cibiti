"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CloudOff, Flag, LayoutGrid, Loader2, Lock } from "lucide-react";
import { hasAnswer, ItemPlayer } from "@/items/players";
import { optionKey } from "@/items/player-types";
import { clearPendingAnswers, useAutosave, type ItemState, type SaveStatus } from "./use-autosave";
import { useDeviceId } from "./use-device-id";
import { useIntegrityEvents } from "./use-integrity-events";
import { formatDuration, useServerCountdown } from "./use-server-countdown";
import type { ApiError, AttemptState, ClosedAttempt, InProgressAttempt } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

type Loaded = { attempt: AttemptState; clockOffsetMs: number };

type OpenOutcome = { ok: true; loaded: Loaded } | { ok: false; message: string; code?: string };

async function requestAttempt(examId: string, deviceId: string, accessCode?: string): Promise<OpenOutcome> {
  try {
    const res = await fetch(`/api/exams/${examId}/attempts`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ deviceId, accessCode }),
    });
    const data = (await res.json().catch(() => ({}))) as ApiError & { attempt?: AttemptState };
    if (!res.ok || !data.attempt) return { ok: false, message: data.error ?? "This exam could not be opened.", code: data.details?.code };
    return { ok: true, loaded: { attempt: data.attempt, clockOffsetMs: Date.parse(data.attempt.serverNow) - Date.now() } };
  } catch {
    return { ok: false, message: "Cannot reach the exam server. Check the network cable or Wi-Fi, then try again.", code: "NETWORK" };
  }
}

export function ExamPlayer({ examId }: { examId: string }) {
  const deviceId = useDeviceId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const needsCode = error?.code === "ACCESS_CODE_REQUIRED";

  const apply = useCallback((outcome: OpenOutcome) => {
    if (outcome.ok) {
      setError(null);
      setLoaded(outcome.loaded);
    } else {
      setError({ message: outcome.message, code: outcome.code });
    }
  }, []);

  const open = useCallback(
    (accessCode?: string) => {
      if (deviceId) void requestAttempt(examId, deviceId, accessCode).then(apply);
    },
    [apply, deviceId, examId],
  );

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    void requestAttempt(examId, deviceId).then((outcome) => {
      if (!cancelled) apply(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, deviceId, examId]);

  const refresh = useCallback(async (attemptId: string) => {
    if (!deviceId) return;
    const res = await fetch(`/api/attempts/${attemptId}/resume`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ deviceId }) });
    const data = (await res.json().catch(() => ({}))) as { attempt?: AttemptState };
    if (data.attempt) setLoaded({ attempt: data.attempt, clockOffsetMs: Date.parse(data.attempt.serverNow) - Date.now() });
  }, [deviceId]);

  if (!loaded) {
    return (
      <main className="auth-page">
        <section className="auth-card player-gate">
          <p className="eyebrow auth-eyebrow">EXAM</p>
          {!error && <p className="take-loading"><Loader2 className="spin" size={18} /> Preparing your exam…</p>}
          {error && !needsCode && (
            <>
              <h1>{error.code === "DEVICE_LOCKED" ? "Exam open elsewhere" : "Unable to open exam"}</h1>
              <p className="auth-copy">{error.message}</p>
              <div className="gate-actions">
                <button className="primary-button auth-submit" onClick={() => void open()}>Try again<span>-&gt;</span></button>
                <Link className="outline-button" href="/">Back to dashboard</Link>
              </div>
            </>
          )}
          {needsCode && <AccessCodeForm message={error?.message} onSubmit={(code) => void open(code)} />}
        </section>
      </main>
    );
  }

  if (loaded.attempt.status !== "IN_PROGRESS") return <ResultScreen attempt={loaded.attempt} />;

  return (
    <PlayerSession
      key={loaded.attempt.id}
      attempt={loaded.attempt}
      clockOffsetMs={loaded.clockOffsetMs}
      deviceId={deviceId!}
      onClosed={() => void refresh(loaded.attempt.id)}
      onSubmitted={(attempt) => setLoaded({ attempt, clockOffsetMs: loaded.clockOffsetMs })}
    />
  );
}

function AccessCodeForm({ message, onSubmit }: { message?: string; onSubmit: (code: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(String(new FormData(event.currentTarget).get("code") ?? "").trim());
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>Access code</h1>
      <p className="auth-copy">{message ?? "Enter the access code announced by the invigilator."}</p>
      <label htmlFor="code">Code</label>
      <input id="code" name="code" autoComplete="off" autoFocus required />
      <button className="primary-button auth-submit" type="submit">Continue<span>-&gt;</span></button>
    </form>
  );
}

// ─────────────── Active session ───────────────

const indexKey = (attemptId: string) => `cibiti:attempt:${attemptId}:index`;
const startedKey = (attemptId: string) => `cibiti:attempt:${attemptId}:started`;

function readNumber(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && localStorage.getItem(key) !== null ? value : fallback;
  } catch {
    return fallback;
  }
}

function PlayerSession({
  attempt,
  clockOffsetMs: initialOffset,
  deviceId,
  onClosed,
  onSubmitted,
}: {
  attempt: InProgressAttempt;
  clockOffsetMs: number;
  deviceId: string;
  onClosed: () => void;
  onSubmitted: (attempt: ClosedAttempt) => void;
}) {
  const initialItems = useMemo(
    () =>
      Object.fromEntries(
        attempt.items.map((item): [string, ItemState] => [
          item.id,
          { value: item.response?.value ?? null, flagged: item.response?.flagged ?? false, revision: item.response?.revision ?? 0, timeSpentMs: item.response?.timeSpentMs ?? 0 },
        ]),
      ),
    [attempt.items],
  );

  const [deadlineAt, setDeadlineAt] = useState(attempt.deadlineAt);
  const [clockOffsetMs, setClockOffsetMs] = useState(initialOffset);
  const autosave = useAutosave({
    attemptId: attempt.id,
    deviceId,
    initial: initialItems,
    onClosed,
    onServerTime: (deadline, serverNow) => {
      setDeadlineAt(deadline);
      setClockOffsetMs(Date.parse(serverNow) - Date.now());
    },
  });
  const integrity = useIntegrityEvents({ attemptId: attempt.id, deviceId, level: attempt.integrityLevel });

  const total = attempt.items.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, readNumber(indexKey(attempt.id), 0)), total - 1));
  const [started, setStarted] = useState(() => readNumber(startedKey(attempt.id), 0) === 1);
  const [mode, setMode] = useState<"question" | "review">("question");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const shownAt = useRef<number | null>(null);

  const item = attempt.items[index];
  const state = autosave.items[item.id];
  const linear = attempt.navigation === "LINEAR";
  const sectionTitle = attempt.sections.length > 1 ? attempt.sections.find((s) => s.id === item.sectionId)?.title : undefined;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    await autosave.flush();
    try {
      const res = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ deviceId }) });
      const data = (await res.json().catch(() => ({}))) as ApiError & { attempt?: AttemptState };
      if (res.ok && data.attempt && data.attempt.status !== "IN_PROGRESS") {
        clearPendingAnswers(attempt.id);
        onSubmitted(data.attempt);
        return;
      }
      setSubmitError(data.error ?? "Your exam could not be submitted. Your answers are saved; try again.");
    } catch {
      setSubmitError("No connection to the exam server. Your answers are kept on this computer; try again when the network is back.");
    }
    setSubmitting(false);
  }, [attempt.id, autosave, deviceId, onSubmitted]);

  const remainingMs = useServerCountdown(deadlineAt, clockOffsetMs, () => {
    setTimeUp(true);
    void submit();
  });

  // Track time on the visible question.
  useEffect(() => {
    if (!started || mode !== "question") return;
    shownAt.current = Date.now();
    const itemId = item.id;
    return () => {
      if (shownAt.current) autosave.addTime(itemId, Date.now() - shownAt.current);
      shownAt.current = null;
    };
  }, [autosave, item.id, mode, started]);

  useEffect(() => {
    try {
      localStorage.setItem(indexKey(attempt.id), String(index));
    } catch {
      // Not critical.
    }
  }, [attempt.id, index]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      if (linear && next < index) return;
      setIndex(next);
      setMode("question");
    },
    [index, linear, total],
  );

  const toggleFlag = useCallback(() => autosave.update(item.id, { flagged: !state.flagged }), [autosave, item.id, state.flagged]);

  // Keyboard shortcuts: A–E choose an option, N/P or arrows move, F flags.
  useEffect(() => {
    if (!started || mode !== "question" || confirming) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input[type=text], input:not([type]), textarea, [contenteditable]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "n" || event.key === "ArrowRight") goTo(index + 1);
      else if (key === "p" || event.key === "ArrowLeft") goTo(index - 1);
      else if (key === "f") toggleFlag();
      else if (/^[a-h]$/.test(key)) {
        const input = document.querySelector<HTMLInputElement>(`[data-question="${item.id}"] [data-option-index="${key.charCodeAt(0) - 97}"] input`);
        input?.click();
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, goTo, index, item.id, mode, started, toggleFlag]);

  const answeredCount = attempt.items.filter((i) => hasAnswer(autosave.items[i.id]?.value)).length;
  const flaggedCount = attempt.items.filter((i) => autosave.items[i.id]?.flagged).length;
  const needsFullscreen = integrity.enforce && !integrity.fullscreen;

  if (!started) {
    return (
      <main className="auth-page">
        <section className="auth-card instructions-card">
          <p className="eyebrow auth-eyebrow">BEFORE YOU BEGIN</p>
          <h1>{attempt.examTitle}</h1>
          <ul className="instruction-facts">
            <li><strong>{total}</strong> questions</li>
            <li><strong>{deadlineAt && remainingMs !== null ? formatDuration(remainingMs) : attempt.deadlineAt ? "…" : "No time limit"}</strong>{attempt.deadlineAt ? " remaining" : ""}</li>
            <li>{linear ? "You cannot return to earlier questions" : "You can move between questions freely"}</li>
          </ul>
          {attempt.instructions && <p className="instructions-text">{attempt.instructions}</p>}
          <p className="auth-copy">Answers save automatically. If the computer or network fails, sign in again on any computer and ask the invigilator to continue your exam.</p>
          {integrity.enforce && <p className="take-warning">This exam is monitored. It runs in fullscreen, and leaving the exam window is recorded.</p>}
          <button
            className="primary-button auth-submit"
            onClick={() => {
              if (integrity.enforce) void integrity.requestFullscreen();
              try {
                localStorage.setItem(startedKey(attempt.id), "1");
              } catch {
                // Not critical.
              }
              setStarted(true);
            }}
          >
            Start exam<span>-&gt;</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="player">
      <header className="player-topbar">
        <div className="player-title">
          <span className="brand-mark">C</span>
          <strong>{attempt.examTitle}</strong>
        </div>
        <SaveIndicator status={autosave.status} />
        <div className={`player-timer ${remainingMs !== null && remainingMs <= 5 * 60_000 ? "low" : ""}`} role="timer" aria-live={remainingMs !== null && remainingMs <= 60_000 ? "assertive" : "off"}>
          {deadlineAt ? (remainingMs === null ? "--:--" : formatDuration(remainingMs)) : "Untimed"}
        </div>
      </header>

      {integrity.enforce && integrity.warning && (
        <div className="take-warning player-banner" role="alert">
          <AlertTriangle size={16} /> {integrity.warning}
          <button className="text-button" onClick={integrity.dismissWarning}>Dismiss</button>
        </div>
      )}
      {autosave.status === "offline" && (
        <div className="take-warning player-banner" role="status"><CloudOff size={16} /> Offline. Your answers are kept on this computer and will be sent when the connection returns.</div>
      )}
      {autosave.status === "locked" && (
        <div className="take-error player-banner" role="alert"><Lock size={16} /> This exam has been opened on another computer. Ask the invigilator for help.</div>
      )}

      {needsFullscreen ? (
        <section className="lockdown-gate">
          <div className="aside-symbol">!</div>
          <h2>Return to fullscreen</h2>
          <p>This exam must be taken in fullscreen. Leaving fullscreen has been recorded.</p>
          <button className="primary-button" onClick={() => void integrity.requestFullscreen()}>Enter fullscreen<span>-&gt;</span></button>
        </section>
      ) : (
        <div className="player-body">
          <aside className="palette" aria-label="Question navigator">
            <div className="palette-head">
              <LayoutGrid size={14} /> <span>{answeredCount} of {total} answered</span>
            </div>
            <div className="palette-grid">
              {attempt.items.map((entry, i) => {
                const s = autosave.items[entry.id];
                const classes = ["palette-cell", hasAnswer(s?.value) ? "answered" : "", s?.flagged ? "flagged" : "", i === index && mode === "question" ? "current" : ""].join(" ");
                return (
                  <button key={entry.id} className={classes} onClick={() => goTo(i)} disabled={linear && i < index} aria-label={`Question ${i + 1}${hasAnswer(s?.value) ? ", answered" : ""}${s?.flagged ? ", flagged" : ""}`}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="palette-legend">
              <span><i className="legend answered" /> Answered</span>
              <span><i className="legend flagged" /> Flagged</span>
            </div>
            <button className="primary-button palette-submit" onClick={() => setMode("review")}>Review &amp; submit</button>
          </aside>

          <section className="player-main">
            {mode === "question" ? (
              <article className="player-card" data-question={item.id}>
                {sectionTitle && <p className="eyebrow">{sectionTitle.toUpperCase()}</p>}
                <div className="take-q-head">
                  <span className="take-index" id={`q-${item.id}-label`}>Question {index + 1} of {total}</span>
                  <span className="take-points">{item.points} mark{item.points === 1 ? "" : "s"}</span>
                  <button className={`flag-toggle ${state.flagged ? "on" : ""}`} onClick={toggleFlag} aria-pressed={state.flagged}>
                    <Flag size={14} /> {state.flagged ? "Flagged" : "Flag for review"}
                  </button>
                </div>
                <h2 className="player-prompt" id={`q-${item.id}-prompt`}>{item.content.text}</h2>
                <ItemPlayer
                  type={item.type}
                  view={item.view}
                  value={state.value}
                  name={`q-${item.id}`}
                  labelledBy={`q-${item.id}-prompt`}
                  disabled={submitting || timeUp || autosave.status === "locked"}
                  onChange={(value) => autosave.update(item.id, { value })}
                />
                <nav className="player-nav">
                  {!linear && (
                    <button className="outline-button" onClick={() => goTo(index - 1)} disabled={index === 0}>
                      <ChevronLeft size={16} /> Previous
                    </button>
                  )}
                  {index < total - 1 ? (
                    <button className="primary-button" onClick={() => goTo(index + 1)}>
                      Next <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button className="primary-button" onClick={() => setMode("review")}>Review answers <ChevronRight size={16} /></button>
                  )}
                </nav>
                <p className="shortcut-hint">Shortcuts: {optionKey(0)}–{optionKey(4)} choose · N next · P previous · F flag</p>
              </article>
            ) : (
              <article className="player-card">
                <p className="eyebrow">REVIEW</p>
                <h2 className="player-prompt">Check your answers</h2>
                <p className="auth-copy">
                  {answeredCount} of {total} answered{total - answeredCount ? ` · ${total - answeredCount} unanswered` : ""}
                  {flaggedCount ? ` · ${flaggedCount} flagged` : ""}.
                </p>
                <div className="review-grid">
                  {attempt.items.map((entry, i) => {
                    const s = autosave.items[entry.id];
                    return (
                      <button key={entry.id} className={`review-cell ${hasAnswer(s?.value) ? "answered" : "unanswered"} ${s?.flagged ? "flagged" : ""}`} onClick={() => goTo(i)} disabled={linear && i < index}>
                        <strong>Q{i + 1}</strong>
                        <span>{hasAnswer(s?.value) ? "Answered" : "Not answered"}{s?.flagged ? " · Flagged" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <nav className="player-nav">
                  <button className="outline-button" onClick={() => setMode("question")}><ChevronLeft size={16} /> Back to questions</button>
                  <button className="primary-button" onClick={() => setConfirming(true)}>Submit exam<span>-&gt;</span></button>
                </nav>
              </article>
            )}
          </section>
        </div>
      )}

      {(confirming || timeUp) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="modal">
            <h2 id="submit-title">{timeUp ? "Time is up" : "Submit your exam?"}</h2>
            {timeUp ? (
              <p>Your answers are being submitted automatically.</p>
            ) : (
              <p>
                You have answered {answeredCount} of {total} questions.
                {total - answeredCount > 0 && ` ${total - answeredCount} question${total - answeredCount === 1 ? " is" : "s are"} unanswered.`} You cannot change your answers after submitting.
              </p>
            )}
            {submitError && <p className="take-error">{submitError}</p>}
            <div className="modal-actions">
              {!timeUp && <button className="outline-button" onClick={() => setConfirming(false)} disabled={submitting}>Keep working</button>}
              <button className="primary-button" onClick={() => void submit()} disabled={submitting && !submitError}>
                {submitting && !submitError ? <><Loader2 className="spin" size={16} /> Submitting…</> : timeUp ? "Retry submission" : "Submit now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label: Record<SaveStatus, string> = {
    idle: "All answers saved",
    saving: "Saving…",
    saved: "All answers saved",
    offline: "Offline — saved on this computer",
    locked: "Not saving",
    error: "Retrying save…",
  };
  const Icon = status === "saving" || status === "error" ? Loader2 : status === "offline" || status === "locked" ? CloudOff : Check;
  return (
    <span className={`save-indicator ${status}`} role="status" aria-live="polite">
      <Icon size={14} className={status === "saving" ? "spin" : ""} /> {label[status]}
    </span>
  );
}

// ─────────────── Result ───────────────

function ResultScreen({ attempt }: { attempt: ClosedAttempt }) {
  const { result } = attempt;
  return (
    <main className="auth-page">
      <section className="auth-card result-card">
        <p className="eyebrow auth-eyebrow">{attempt.submissionType === "TIME_EXPIRED" ? "SUBMITTED WHEN TIME RAN OUT" : "EXAM SUBMITTED"}</p>
        <h1>{attempt.examTitle}</h1>
        {result && result.percent !== null ? (
          <>
            <div className="result-score">
              <strong>{Math.round(result.percent)}<span>%</span></strong>
              <p>{result.score} of {result.maxScore} marks</p>
            </div>
            <p className="result-copy">{result.passed ? "You met the pass mark for this exam." : "You did not meet the pass mark this time."}</p>
          </>
        ) : (
          <p className="result-copy">
            {attempt.awaitingGrading
              ? "Your answers have been received. Some questions are marked by an examiner, so your result will be released later."
              : "Your answers have been received. Your institution will release results when marking is complete."}
          </p>
        )}
        <Link className="primary-button auth-submit" href="/">Back to dashboard<span>-&gt;</span></Link>
      </section>
    </main>
  );
}
