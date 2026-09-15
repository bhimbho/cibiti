"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";
import { toCsv } from "@/lib/csv";

type PreviewRow = {
  line: number;
  name: string;
  email: string | null;
  regNumber: string | null;
  roles: string[];
  courseIds: string[];
  hasPassword: boolean;
  errors: string[];
};
type Preview = { problems: string[]; unknownHeaders: string[]; total: number; valid: number; rows: PreviewRow[] };
type JobState = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number;
  error: string | null;
  result: { total: number; created: number; failed: { line: number; errors: string[] }[] } | null;
  credentialsAvailable: boolean;
};

function download(filename: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const template = toCsv([
  ["name", "matric_number", "email", "role", "department", "level", "groups", "courses", "password"],
  ["Adaeze Okafor", "CSC/2026/101", "", "candidate", "CSC", "100L", "", "CSC101", ""],
  ["Bello Musa", "CSC/2026/102", "", "candidate", "CSC", "100L", "", "CSC101", ""],
  ["Dr. Kemi Lawal", "", "k.lawal@school.edu", "instructor", "CSC", "", "", "", ""],
]);

export function ImportWizard() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const poll = async () => {
      const result = await callApi<{ job: JobState }>(`/api/jobs/${jobId}`, "GET");
      if (stopped) return;
      if (result.ok) setJob(result.data.job);
      const done = result.ok && (result.data.job.status === "SUCCEEDED" || result.data.job.status === "FAILED");
      if (!done) timer = setTimeout(poll, 1500);
    };
    let timer = setTimeout(poll, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
  }

  async function check() {
    setPending(true);
    setError(null);
    const result = await callApi<Preview>("/api/people/import", "POST", { csv, commit: false });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setPreview(result.data);
  }

  async function commit() {
    setPending(true);
    setError(null);
    const result = await callApi<{ jobId: string }>("/api/people/import", "POST", { csv, commit: true });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setJobId(result.data.jobId);
  }

  async function downloadPasswords() {
    const res = await fetch(`/api/jobs/${jobId}/credentials`, { method: "POST" }).catch(() => null);
    if (!res?.ok) return setError("Could not download the passwords.");
    download("imported-passwords.csv", await res.text());
    setDownloaded(true);
  }

  if (jobId) {
    const finished = job?.status === "SUCCEEDED" || job?.status === "FAILED";
    return (
      <section className="panel import-panel">
        <p className="eyebrow">IMPORT {finished ? (job?.status === "SUCCEEDED" ? "COMPLETE" : "FAILED") : "IN PROGRESS"}</p>
        {!finished && (
          <>
            <div className="progress"><span style={{ width: `${job?.progress ?? 0}%` }} /></div>
            <p className="take-hint"><Loader2 size={14} className="spin" /> Creating accounts… {job?.progress ?? 0}%. You can leave this page; the import keeps running on the server.</p>
          </>
        )}
        {job?.status === "FAILED" && <p className="take-error">{job.error}</p>}
        {job?.status === "SUCCEEDED" && job.result && (
          <>
            <h2 className="import-summary"><CheckCircle2 size={20} /> {job.result.created} of {job.result.total} accounts created</h2>
            {job.result.failed.length > 0 && (
              <div className="take-warning">
                <strong>
                  {job.result.failed.length} row{job.result.failed.length === 1 ? " was" : "s were"} skipped:
                </strong>
                <ul>{job.result.failed.slice(0, 50).map((f) => <li key={f.line}>Line {f.line}: {f.errors.join(" ")}</li>)}</ul>
              </div>
            )}
            {job.credentialsAvailable && !downloaded && (
              <div className="password-reveal">
                <p className="eyebrow">GENERATED PASSWORDS</p>
                <p className="take-hint">Rows without a password got a generated one. Download the list now; it can only be downloaded once and is then deleted from the server.</p>
                <button type="button" className="primary-button" onClick={downloadPasswords}><Download size={14} /> Download passwords</button>
              </div>
            )}
            {downloaded && <p className="form-message">Passwords downloaded and removed from the server. Store the file securely.</p>}
          </>
        )}
        {error && <p className="take-error">{error}</p>}
        <div className="editor-actions"><Link className="secondary-button" href="/people">Back to people</Link></div>
      </section>
    );
  }

  const rows = preview?.rows.filter((r) => !onlyErrors || r.errors.length) ?? [];

  return (
    <div className="builder-sections">
      <section className="panel import-panel">
        <p className="eyebrow">1 · CHOOSE A FILE</p>
        <p className="take-hint">
          One person per row. Required: <strong>name</strong> and a <strong>matric number</strong> or <strong>email</strong>. Optional: role (defaults to candidate), department code, level, groups and course codes (separate several with ;), and password (generated when blank).
        </p>
        <div className="import-actions">
          <label className="secondary-button file-button">
            <FileUp size={14} /> {fileName ?? "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="text-button" onClick={() => download("people-template.csv", template)}><Download size={14} /> Download template</button>
        </div>
        <label className="paste-label">
          Or paste CSV
          <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setFileName(null); }} rows={6} placeholder={"name,matric_number,department,level,courses\nAdaeze Okafor,CSC/2026/101,CSC,100L,CSC101"} />
        </label>
        <div className="editor-actions">
          <button type="button" className="primary-button" disabled={!csv.trim() || pending} onClick={check}>{pending && !preview ? "Checking…" : "Check file"}<span>-&gt;</span></button>
        </div>
        {error && <p className="take-error">{error}</p>}
      </section>

      {preview && (
        <section className="panel import-panel">
          <p className="eyebrow">2 · REVIEW</p>
          {preview.problems.map((p) => <p key={p} className="take-error">{p}</p>)}
          {preview.unknownHeaders.length > 0 && <p className="take-warning">Ignored columns: {preview.unknownHeaders.join(", ")}</p>}
          {preview.problems.length === 0 && (
            <>
              <div className="import-counts">
                <span><strong>{preview.total}</strong> rows</span>
                <span className="score-pass"><strong>{preview.valid}</strong> ready</span>
                <span className={preview.total - preview.valid ? "score-fail" : ""}><strong>{preview.total - preview.valid}</strong> with problems</span>
                <label className="check-label"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Show only problems</label>
              </div>
              <div className="dt-scroll import-table">
                <table className="plain-table">
                  <thead><tr><th>Line</th><th>Name</th><th>Signs in with</th><th>Roles</th><th>Courses</th><th>Password</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 300).map((row) => (
                      <tr key={row.line} className={row.errors.length ? "row-error" : ""}>
                        <td>{row.line}</td>
                        <td>{row.name}</td>
                        <td>{row.regNumber ?? row.email}</td>
                        <td>{row.roles.map((r) => r.toLowerCase()).join(", ")}</td>
                        <td>{row.courseIds.length}</td>
                        <td>{row.hasPassword ? "Provided" : "Generated"}</td>
                        <td>{row.errors.length ? <span className="score-fail"><XCircle size={13} /> {row.errors.join(" ")}</span> : <span className="score-pass"><CheckCircle2 size={13} /> Ready</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 300 && <p className="take-hint">Showing the first 300 rows.</p>}
              <div className="editor-actions">
                <button type="button" className="primary-button" disabled={preview.valid === 0 || pending} onClick={commit}>
                  {pending ? "Starting…" : `Import ${preview.valid} ${preview.valid === 1 ? "person" : "people"}`}<span>-&gt;</span>
                </button>
                {preview.total - preview.valid > 0 && <span className="take-hint">Rows with problems are skipped. Fix the file and check again to include them.</span>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
