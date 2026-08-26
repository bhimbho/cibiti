"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useExamLockdown } from "@/lib/use-exam-lockdown";
import { useCountdown, formatTime } from "@/lib/use-countdown";

type Question = { questionId: string; type: string; prompt: string; options?: string[]; points: number };
type Result = { score: number; maxScore: number; pct: number; passed: boolean };

export default function TakeExamPage() {
  const params = useParams<{ id: string }>();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState("");
  const [timeLimitSec, setTimeLimitSec] = useState<number | null>(null);
  const { fullscreen, enterFullscreen } = useExamLockdown((reason) => setWarning(reason));

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = async () => {
    if (!attemptId) return;
    setPending(true);
    setError("");
    const res = await fetch(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) { setError(data.error ?? "Unable to submit."); return; }
    setResult(data.result);
  };

  const remaining = useCountdown(timeLimitSec, () => submitRef.current());

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: params.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Unable to start the exam."); return; }
      setAttemptId(data.attempt.id);
      setQuestions(data.questions);
      if (data.attempt.timeLimitMin) setTimeLimitSec(data.attempt.timeLimitMin * 60);
    })();
  }, [params.id]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  async function submit() {
    if (!attemptId) return;
    setPending(true);
    setError("");
    const res = await fetch(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) { setError(data.error ?? "Unable to submit."); return; }
    setResult(data.result);
  }

  if (result) {
    return (
      <main className="auth-page">
        <section className="auth-card result-card">
          <p className="eyebrow auth-eyebrow">ASSESSMENT COMPLETE</p>
          <h1>{result.passed ? "Well done." : "Keep practicing."}</h1>
          <div className="result-score"><strong>{result.pct}<span>%</span></strong><p>{result.score} of {result.maxScore} points</p></div>
          <p className="result-copy">{result.passed ? "You met the pass mark for this assessment." : "You did not meet the pass mark this time. Review the material and try again."}</p>
          <a className="primary-button auth-submit" href="/">Back to overview<span>-&gt;</span></a>
        </section>
      </main>
    );
  }

  return (
    <main className="take-page">
      <header className="take-topbar"><a className="back-link" href="/">&lt;- Exit</a><strong>Assessment in progress</strong><div className="take-timer"><span>{answeredCount} / {questions.length} answered</span>{remaining != null && <strong className={remaining <= 60 ? "timer-low" : ""}>{formatTime(remaining)}</strong>}</div></header>
      {error && <p className="take-error" role="alert">{error}</p>}
      {warning && <p className="take-warning" role="alert">{warning} — this is being recorded.</p>}
      {!attemptId && !error && <p className="take-loading">Preparing your assessment...</p>}
      {attemptId && !fullscreen && (
        <section className="lockdown-gate">
          <div className="aside-symbol">!</div>
          <h2>Secure exam mode</h2>
          <p>This assessment is monitored. Enter fullscreen to begin. Leaving the exam window will be recorded.</p>
          <button className="primary-button" onClick={enterFullscreen}>Enter fullscreen<span>-&gt;</span></button>
        </section>
      )}
      {attemptId && fullscreen && (
        <section className="take-body">
          {questions.map((q, index) => (
            <article className="take-question" key={q.questionId}>
              <div className="take-q-head"><span className="take-index">Q{index + 1}</span><span className="take-points">{q.points} pt{q.points > 1 ? "s" : ""}</span></div>
              <h2>{q.prompt}</h2>
              <div className="take-options">
                {q.options?.map((option) => (
                  <label className="take-option" key={option}>
                    <input type="radio" name={q.questionId} value={option} checked={answers[q.questionId] === option} onChange={() => setAnswers((prev) => ({ ...prev, [q.questionId]: option }))} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          <button className="primary-button take-submit" onClick={submit} disabled={pending || answeredCount < questions.length}>
            {pending ? "Submitting..." : "Submit assessment"}<span>-&gt;</span>
          </button>
        </section>
      )}
    </main>
  );
}
