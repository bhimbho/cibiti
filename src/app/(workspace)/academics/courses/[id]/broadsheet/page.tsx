import type { Metadata } from "next";
import Link from "next/link";
import { courseBroadsheet } from "@/server/grades/broadsheet";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Broadsheet | Cibiti" };

export default async function BroadsheetPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("results:read");
  const { id } = await params;
  const sheet = await courseBroadsheet(actor, id);

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href={`/academics/courses/${sheet.course.id}`}>&lt;- Back to course</Link>
          <p className="eyebrow">BROADSHEET</p>
          <h1>{sheet.course.code} · {sheet.course.title}</h1>
          <p>
            {sheet.summary.candidates} registered · {sheet.summary.withMarks} with marks
            {sheet.summary.mean !== null && ` · mean ${sheet.summary.mean}%`}
            {sheet.summary.passRate !== null && ` · ${sheet.summary.passRate}% passing`}
            {sheet.summary.gpa !== null && ` · GPA ${sheet.summary.gpa}`}
          </p>
        </div>
        <div className="exam-detail-actions">
          {/* A plain link, so the browser handles the download. */}
          <a className="secondary-button" href={`/api/courses/${sheet.course.id}/broadsheet`}>Download CSV</a>
        </div>
      </div>

      {sheet.inferredColumns && sheet.columns.length > 0 && (
        <p className="take-hint">
          No assessment components are set for this course, so its exams are shown with equal weight.
          Set the CA and exam split on the course page to weight them properly.
        </p>
      )}

      {sheet.columns.length === 0 ? (
        <p className="take-loading">This course has no exams yet, so there is nothing to compile.</p>
      ) : sheet.rows.length === 0 ? (
        <p className="take-loading">No candidates are registered on this course yet.</p>
      ) : (
        <div className="dt-scroll">
          <table className="dt">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Matric number</th>
                {sheet.columns.map((column) => (
                  <th key={column.id}>
                    {column.name}
                    <span className="field-hint"> {column.weightPct}%</span>
                  </th>
                ))}
                <th>Total</th>
                <th>Grade</th>
                <th>Point</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.candidate}</td>
                  <td>{row.regNumber ?? "—"}</td>
                  {row.parts.map((part, index) => (
                    <td key={sheet.columns[index].id}>
                      {part === null ? <span className="draft-hint">—</span> : `${Math.round(part * 100) / 100}%`}
                    </td>
                  ))}
                  <td>
                    {row.total === null ? (
                      <span className="draft-hint">—</span>
                    ) : (
                      <>
                        {row.total}%
                        {/* A total resting on part of the course is not a final mark. */}
                        {row.coverage < 100 && <span className="field-hint"> of {row.coverage}%</span>}
                      </>
                    )}
                  </td>
                  <td>{row.grade ?? <span className="draft-hint">—</span>}</td>
                  <td>{row.gradePoint ?? <span className="draft-hint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="field-hint">
        Each component takes the candidate&rsquo;s best graded attempt on its exam. Attempts still
        being marked count for nothing rather than zero, so a total can cover only part of the course.
      </p>
    </main>
  );
}
