import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { examAnalytics } from "@/server/analytics/exam";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Exam statistics | Cibiti" };

function show(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

export default async function ExamStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("results:read");
  const { id } = await params;
  const data = await examAnalytics(actor, id);
  if (!data) notFound();

  const peak = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <p className="eyebrow">STATISTICS</p>
          <h1>{data.exam.title}</h1>
          <p>
            {data.counted} graded attempt{data.counted === 1 ? "" : "s"}
            {data.awaitingMarking > 0 && ` · ${data.awaitingMarking} still awaiting marking and not counted`}
          </p>
        </div>
        <div className="exam-detail-actions">
          <Link className="outline-button" href={`/results?exam=${data.exam.id}`}>Results</Link>
          <Link className="outline-button" href={`/exams/${data.exam.id}`}>Exam</Link>
        </div>
      </div>

      {data.counted === 0 ? (
        <p className="take-loading">
          Statistics appear once attempts have been marked. Nothing has been graded for this exam yet.
        </p>
      ) : (
        <>
          <section className="content-grid section-scores">
            <div className="panel">
              <p className="eyebrow">COHORT</p>
              <div className="aside-line"><span>Mean</span><strong>{data.summary.mean}%</strong></div>
              <div className="aside-line"><span>Median</span><strong>{data.summary.median}%</strong></div>
              <div className="aside-line"><span>Spread (SD)</span><strong>{data.summary.standardDeviation}</strong></div>
              <div className="aside-line"><span>Highest / lowest</span><strong>{data.summary.highest}% / {data.summary.lowest}%</strong></div>
              <div className="aside-line"><span>Pass rate at {data.exam.passMarkPct}%</span><strong>{data.summary.passRate}%</strong></div>
            </div>

            <div className="panel">
              <p className="eyebrow">RELIABILITY</p>
              <div className="aside-line"><span>Cronbach&rsquo;s α</span><strong>{show(data.summary.alpha)}</strong></div>
              <div className="aside-line"><span>Standard error</span><strong>{show(data.summary.standardError, " pts")}</strong></div>
              <p className="field-hint">
                α above 0.7 is usually considered acceptable for a classroom test. It needs a
                common set of questions, so a paper built entirely from random draws reports none.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">DISTRIBUTION</p><h2>Score bands</h2></div></div>
            <div className="stat-bars">
              {data.distribution.map((band) => (
                <div className="stat-bar" key={band.label}>
                  <span className="stat-bar-label">{band.label}</span>
                  <span className="stat-bar-track">
                    <span className="stat-bar-fill" style={{ width: `${(band.count / peak) * 100}%` }} />
                  </span>
                  <span className="stat-bar-count">{band.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">CUT SCORE</p>
                <h2>What moving the pass mark would cost</h2>
              </div>
            </div>
            <div className="stat-bars">
              {data.cutScores.map((cut) => (
                <div className="stat-bar" key={cut.cut}>
                  <span className="stat-bar-label">
                    {cut.cut}%{cut.cut === data.exam.passMarkPct ? " (current)" : ""}
                  </span>
                  <span className="stat-bar-track">
                    <span className="stat-bar-fill" style={{ width: `${cut.rate}%` }} />
                  </span>
                  <span className="stat-bar-count">{cut.passed} pass ({cut.rate}%)</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">ITEM ANALYSIS</p>
                <h2>Question by question</h2>
              </div>
            </div>
            <div className="dt-scroll">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Answered</th>
                    <th>Difficulty</th>
                    <th>Full marks</th>
                    <th>Discrimination</th>
                    <th>Top−bottom</th>
                    <th>Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.questionId}>
                      <td>
                        <Link className="dt-link" href={`/questions/${item.questionId}`}>
                          {item.text || "Untitled question"}
                        </Link>
                        <span className="field-hint"> {item.type} · {item.maxPoints} mark{item.maxPoints === 1 ? "" : "s"}</span>
                      </td>
                      <td>
                        {item.responses}
                        {item.partialCohort && <span className="field-hint"> (drawn)</span>}
                      </td>
                      <td>{show(item.difficulty)}</td>
                      <td>{show(item.fullMarks, "%")}</td>
                      <td>{show(item.discrimination)}</td>
                      <td>{show(item.upperLower)}</td>
                      <td>{item.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint">
              Difficulty is the share of marks earned, so high means easy. Discrimination correlates
              the question against the rest of the paper; negative usually means a wrong answer key.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
