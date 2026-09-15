import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HttpError } from "@/server/http";
import { requirePageActor } from "@/server/page-auth";
import { getAttemptReport, type AttemptReport } from "@/server/results/report";
import { ReleaseButton } from "./release-button";

export const metadata: Metadata = { title: "Attempt report | Cibiti" };

const dateTime = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

const eventLabels: Record<string, string> = {
  "attempt.started": "Started the exam",
  "attempt.resumed": "Resumed the exam",
  "attempt.submitted": "Submitted",
  "focus.lost": "Left the exam window",
  "focus.returned": "Returned to the exam window",
  "visibility.hidden": "Tab hidden",
  "visibility.visible": "Tab visible again",
  "fullscreen.exited": "Left fullscreen",
  "fullscreen.entered": "Entered fullscreen",
  "clipboard.copy": "Tried to copy",
  "clipboard.paste": "Tried to paste",
  "clipboard.cut": "Tried to cut",
  "contextmenu.opened": "Opened the right-click menu",
  "network.offline": "Went offline",
  "network.online": "Back online",
  "screen.extended": "Multiple screens detected",
  "print.attempted": "Tried to print",
  "device.conflict": "Opened on another computer",
  "device.released": "Invigilator moved the exam to another computer",
};

export default async function AttemptReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;

  let report: AttemptReport | null;
  try {
    report = await getAttemptReport(actor, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      return (
        <main className="authoring-page">
          <Link className="back-link" href="/results">&lt;- Back to results</Link>
          <p className="take-loading">{error.message}</p>
        </main>
      );
    }
    throw error;
  }
  if (!report) notFound();

  const { attempt, exam, candidate } = report;
  const duration = attempt.submittedAt ? Math.round((Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt)) / 60_000) : null;

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/results">&lt;- Back to results</Link>
          <p className="eyebrow">{report.viewer === "staff" ? "ATTEMPT REPORT" : "YOUR RESULT"}</p>
          <h1>{exam.title}</h1>
          <p>
            {candidate.name}
            {candidate.regNumber ? ` · ${candidate.regNumber}` : ""} · attempt {attempt.attemptNo} · started {dateTime.format(new Date(attempt.startedAt))}
            {duration !== null ? ` · ${duration} min` : ""}
            {attempt.submissionType === "TIME_EXPIRED" ? " · submitted automatically when time ran out" : ""}
          </p>
        </div>
        <div className="review-score">
          {attempt.percent !== null ? (
            <>
              <strong className={attempt.passed === false ? "score-fail" : "score-pass"}>{Math.round(attempt.percent)}%</strong>
              <span>{attempt.score} / {attempt.maxScore} marks · pass mark {exam.passMarkPct}%</span>
            </>
          ) : (
            <strong className="muted-score">{attempt.status === "IN_PROGRESS" ? "In progress" : "Awaiting marking"}</strong>
          )}
          {report.viewer === "staff" && attempt.status === "GRADED" && !report.released && <ReleaseButton attemptId={attempt.id} />}
          {report.viewer === "staff" && report.released && <span className="draft-hint">Released to candidate</span>}
        </div>
      </div>

      {report.sections.length > 0 && (
        <section className="stats-grid section-scores">
          {report.sections.map((s) => (
            <article className="stat-card" key={s.id}>
              <div className="stat-label">{s.title.toUpperCase()}</div>
              <strong>{s.score}<span className="unit"> / {s.maxScore}</span></strong>
              <span className="trend neutral">{s.maxScore ? Math.round((s.score / s.maxScore) * 100) : 0}%</span>
            </article>
          ))}
        </section>
      )}

      <div className={report.viewer === "staff" ? "report-layout" : ""}>
        <section className="review-list">
          {report.items.map((item) => (
            <article className={`review-item ${item.isCorrect === true ? "correct" : item.isCorrect === null ? "pending" : "incorrect"}`} key={item.id}>
              <div className="review-head">
                <span className="take-index">Q{item.order + 1}</span>
                <span className="review-result">{item.isCorrect === true ? "Correct" : item.isCorrect === null ? "Needs marking" : item.earned ? "Partly correct" : "Incorrect"}</span>
                {report.viewer === "staff" && (
                  <span className="take-hint">
                    {item.typeLabel} · {item.timeSpentSec}s{item.changeCount > 1 ? ` · changed ${item.changeCount - 1}×` : ""}
                    {item.flagged ? " · flagged" : ""}
                  </span>
                )}
                <span className="review-points">{item.earned ?? 0} / {item.points} marks</span>
              </div>
              <h2>{item.text}</h2>
              {item.assetIds.length > 0 && (
                <div className="prompt-images">
                  {item.assetIds.map((assetId) => (
                    // eslint-disable-next-line @next/next/no-img-element -- served from the app's own asset route
                    <img key={assetId} src={`/api/assets/${assetId}`} alt="" />
                  ))}
                </div>
              )}
              {item.review.kind === "choice" ? (
                <div className="review-options">
                  {item.review.options.map((option) => (
                    <div
                      key={option.id}
                      className={`review-option ${option.chosen ? (option.correct ? "chosen-correct" : "chosen-wrong") : option.correct ? "correct-answer" : ""}`}
                    >
                      {option.text}
                      <span>{option.chosen && option.correct ? "Chosen · correct" : option.chosen ? "Chosen" : option.correct ? "Correct answer" : ""}</span>
                    </div>
                  ))}
                  {!item.review.options.some((o) => o.chosen) && <p className="take-hint">Not answered.</p>}
                </div>
              ) : (
                <div className="review-options">
                  <div className={`review-option ${item.isCorrect ? "chosen-correct" : "chosen-wrong"}`}>
                    {item.review.given ?? <em>Not answered</em>}
                    <span>Answer given</span>
                  </div>
                  <div className="review-option correct-answer">
                    {item.review.accepted.join(" · ")}
                    <span>Accepted</span>
                  </div>
                </div>
              )}
              {item.explanation && (
                <div className="question-explanation">
                  <strong>Explanation</strong>
                  <p>{item.explanation}</p>
                </div>
              )}
            </article>
          ))}
          {report.items.length === 0 && report.viewer === "candidate" && report.detail !== "FULL" && (
            <p className="take-loading">Your institution shares {report.detail === "SCORE_ONLY" ? "the overall score" : "section scores"} for this exam.</p>
          )}
        </section>

        {report.viewer === "staff" && (
          <aside className="panel timeline-panel">
            <p className="eyebrow">INTEGRITY TIMELINE</p>
            <div className="aside-line"><span>IP address</span><strong>{attempt.ipAddress ?? "—"}</strong></div>
            <div className="aside-line"><span>Deadline</span><strong>{attempt.deadlineAt ? dateTime.format(new Date(attempt.deadlineAt)) : "Untimed"}</strong></div>
            <ol className="timeline">
              {report.events.map((event) => (
                <li key={event.id} className={`sev-${event.severity.toLowerCase()}`}>
                  <time>{dateTime.format(new Date(event.serverAt))}</time>
                  <span>{eventLabels[event.type] ?? event.type}</span>
                </li>
              ))}
              {report.events.length === 0 && <li>No events recorded.</li>}
            </ol>
          </aside>
        )}
      </div>
    </main>
  );
}
