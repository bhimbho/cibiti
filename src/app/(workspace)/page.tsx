import { AttemptStatus, ExamStatus, QuestionStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/authz";
import { candidateOverview } from "@/server/candidate";
import { requirePageActor } from "@/server/page-auth";

function greeting(date: Date) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const dateFormat = new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });

export default async function OverviewPage() {
  const actor = await requirePageActor();
  return actor.isStaff ? <StaffOverview actor={actor} /> : <CandidateOverview actor={actor} />;
}

function Intro({ actor, copy }: { actor: Actor; copy: string }) {
  const now = new Date();
  return (
    <section className="intro">
      <div>
        <p className="eyebrow">{dateFormat.format(now)}</p>
        <h1>{greeting(now)}, {actor.name.split(" ")[0]}.</h1>
        <p className="intro-copy">{copy}</p>
      </div>
    </section>
  );
}

async function CandidateOverview({ actor }: { actor: Actor }) {
  const { available, history } = await candidateOverview(actor);
  const graded = history.filter((h) => h.percent !== null);
  const average = graded.length ? Math.round(graded.reduce((sum, h) => sum + (h.percent ?? 0), 0) / graded.length) : null;

  return (
    <div className="overview-content">
      <Intro actor={actor} copy="Your exams are listed below. Answers save automatically while you work." />

      <section className="stats-grid" aria-label="Progress summary">
        <article className="stat-card"><div className="stat-label">EXAMS AVAILABLE</div><strong>{available.length}</strong><span className="trend neutral">Assigned to you</span></article>
        <article className="stat-card"><div className="stat-label">COMPLETED</div><strong>{history.length}</strong><span className="trend positive">Submitted attempts</span></article>
        <article className="stat-card highlight"><div className="stat-label">AVERAGE SCORE</div><strong>{average ?? "—"}{average !== null && <span className="unit">%</span>}</strong><span className="trend neutral">Released results</span></article>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Your exams</h2></div></div>
          {available.length === 0 && <p className="take-loading">No exams are available to you right now.</p>}
          {available.map((exam) => {
            const exhausted = !exam.inProgress && exam.attemptsUsed >= exam.maxAttempts;
            const notOpen = exam.nextSitting && !exam.nextSitting.open;
            return (
              <div className="exam-row" key={exam.id}>
                <div className="subject-icon blue">{(exam.course ?? exam.title)[0]}</div>
                <div className="exam-details">
                  <h3>{exam.title}</h3>
                  <p>
                    {exam.course && <>{exam.course}<span>•</span></>}
                    {exam.questionCount} questions<span>•</span>
                    {exam.timeLimitMin ? `${exam.timeLimitMin} min` : "Untimed"}
                    {exam.maxAttempts > 1 && <><span>•</span>{exam.attemptsUsed}/{exam.maxAttempts} attempts</>}
                  </p>
                </div>
                {notOpen ? (
                  <span className="exam-date"><span>Opens</span><strong>{timeFormat.format(new Date(exam.nextSitting!.startsAt))}</strong></span>
                ) : <span />}
                {exhausted ? (
                  <span className="draft-hint">No attempts left</span>
                ) : notOpen ? (
                  <span className="draft-hint">Not open yet</span>
                ) : (
                  <a className="secondary-button" href={`/take/${exam.id}`}>{exam.inProgress ? "Continue" : "Begin"}</a>
                )}
              </div>
            );
          })}
        </div>
        <div className="panel">
          <div className="panel-heading"><div><p className="eyebrow">HISTORY</p><h2>Recent attempts</h2></div></div>
          {history.length === 0 && <p className="take-loading">No submitted attempts yet.</p>}
          {history.slice(0, 8).map((attempt) => (
            <div className="activity-item" key={attempt.id}>
              <div className={`activity-dot ${attempt.passed === false ? "review" : "done"}`}>{attempt.passed === false ? "!" : "✓"}</div>
              <div>
                <h3>{attempt.examTitle}</h3>
                <p>{attempt.submittedAt ? timeFormat.format(new Date(attempt.submittedAt)) : "—"}{attempt.status === AttemptStatus.SUBMITTED ? " · awaiting marking" : ""}</p>
              </div>
              <strong className={attempt.passed === false ? "muted-score" : ""}>{attempt.percent !== null ? `${Math.round(attempt.percent)}%` : "Pending"}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function StaffOverview({ actor }: { actor: Actor }) {
  const orgId = actor.orgId;
  const [approvedQuestions, publishedExams, inProgress, candidates, recent] = await Promise.all([
    prisma.question.count({ where: { orgId, deletedAt: null, status: QuestionStatus.APPROVED } }),
    prisma.exam.count({ where: { orgId, deletedAt: null, status: ExamStatus.PUBLISHED } }),
    prisma.attempt.count({ where: { exam: { orgId }, status: AttemptStatus.IN_PROGRESS } }),
    prisma.user.count({ where: { orgId, isActive: true, memberships: { some: { role: Role.CANDIDATE } } } }),
    prisma.attempt.findMany({
      where: { exam: { orgId }, status: { not: AttemptStatus.IN_PROGRESS } },
      orderBy: { submittedAt: "desc" },
      take: 8,
      include: { exam: { select: { title: true } }, user: { select: { name: true, regNumber: true } } },
    }),
  ]);

  return (
    <div className="overview-content">
      <Intro actor={actor} copy="A live view of your organisation's assessments." />

      <section className="stats-grid stats-grid-4" aria-label="Organisation summary">
        <article className="stat-card"><div className="stat-label">IN PROGRESS NOW</div><strong>{inProgress}</strong><span className="trend positive">Candidates writing</span></article>
        <article className="stat-card"><div className="stat-label">PUBLISHED EXAMS</div><strong>{publishedExams}</strong><span className="trend neutral">Available to candidates</span></article>
        <article className="stat-card"><div className="stat-label">APPROVED QUESTIONS</div><strong>{approvedQuestions}</strong><span className="trend neutral">In the bank</span></article>
        <article className="stat-card highlight"><div className="stat-label">ACTIVE CANDIDATES</div><strong>{candidates}</strong><span className="trend neutral">Registered</span></article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">LATEST</p><h2>Recent submissions</h2></div></div>
        {recent.length === 0 && <p className="take-loading">No submissions yet.</p>}
        {recent.map((attempt) => (
          <div className="activity-item" key={attempt.id}>
            <div className={`activity-dot ${attempt.passed === false ? "review" : "done"}`}>{attempt.submissionType === "TIME_EXPIRED" ? "⏱" : "✓"}</div>
            <div>
              <h3>{attempt.user.name}{attempt.user.regNumber ? ` · ${attempt.user.regNumber}` : ""}</h3>
              <p>{attempt.exam.title} · {attempt.submittedAt ? timeFormat.format(attempt.submittedAt) : "—"}{attempt.status === AttemptStatus.SUBMITTED ? " · needs marking" : ""}</p>
            </div>
            <strong className={attempt.passed === false ? "muted-score" : ""}>{attempt.percent !== null ? `${Math.round(attempt.percent)}%` : "—"}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}
