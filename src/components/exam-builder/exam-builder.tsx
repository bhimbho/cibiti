"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Copy, Lock, Plus, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import type { ExamBuilderData } from "@/server/exams/builder";
import { callApi } from "./api";
import { QuestionPicker } from "./question-picker";
import { ExamSettingsForm } from "./settings-form";

type Tab = "questions" | "settings" | "sittings";
type Props = { data: ExamBuilderData; canPublish: boolean };

const dateTime = new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const statusLabel = { DRAFT: "Draft", PUBLISHED: "Published", CLOSED: "Closed", ARCHIVED: "Archived" } as const;

export function ExamBuilder({ data, canPublish }: Props) {
  const router = useRouter();
  const { settings, sections, preflight, sessions, options, attemptCount } = data;
  const [tab, setTab] = useState<Tab>("questions");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ id: string; title: string } | null>(null);
  const [ruleFor, setRuleFor] = useState<string | null>(null);
  const locked = attemptCount > 0;
  const inExam = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.questionId))), [sections]);

  async function run(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true);
    setMessage(null);
    const result = await callApi(url, method, body);
    setBusy(false);
    if (!result.ok) {
      const errors = (result.details as { errors?: string[] } | undefined)?.errors;
      setMessage({ tone: "error", text: result.error, list: errors });
      return null;
    }
    if (success) setMessage({ tone: "ok", text: success });
    router.refresh();
    return result.data;
  }

  async function duplicate() {
    const result = (await run(`/api/exams/${settings.id}/duplicate`, "POST")) as { exam: { id: string } } | null;
    if (result) router.push(`/exams/${result.exam.id}`);
  }

  async function remove() {
    if (!window.confirm("Delete this exam? This cannot be undone.")) return;
    if (await run(`/api/exams/${settings.id}`, "DELETE")) router.push("/exams");
  }

  return (
    <>
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/exams">&lt;- Back to exams</Link>
          <p className="eyebrow">EXAM BUILDER</p>
          <h1>{settings.title}</h1>
          <p>
            <span className={`status-pill e-${settings.status.toLowerCase()}`}>{statusLabel[settings.status]}</span>
            {" "}{preflight.questionCount} questions · {preflight.maxScore} marks · {settings.timeLimitMin ? `${settings.timeLimitMin} min` : "untimed"} · {attemptCount} attempt{attemptCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="exam-detail-actions">
          {canPublish && settings.status === "DRAFT" && (
            <button className="primary-button" disabled={busy} onClick={() => run(`/api/exams/${settings.id}/status`, "POST", { action: "publish" }, "Exam published. Candidates can now see it.")}>Publish<span>-&gt;</span></button>
          )}
          {canPublish && settings.status === "PUBLISHED" && attemptCount === 0 && (
            <button className="outline-button" disabled={busy} onClick={() => run(`/api/exams/${settings.id}/status`, "POST", { action: "unpublish" }, "Exam moved back to draft.")}>Unpublish</button>
          )}
          {canPublish && settings.status === "PUBLISHED" && (
            <button className="outline-button" disabled={busy} onClick={() => window.confirm("Close the exam? No new attempts can start; attempts in progress continue.") && run(`/api/exams/${settings.id}/status`, "POST", { action: "close" }, "Exam closed.")}>Close exam</button>
          )}
          {canPublish && settings.status === "CLOSED" && (
            <button className="outline-button" disabled={busy} onClick={() => run(`/api/exams/${settings.id}/status`, "POST", { action: "publish" }, "Exam reopened.")}>Reopen</button>
          )}
          <button className="icon-btn" aria-label="Duplicate exam" title="Duplicate" disabled={busy} onClick={duplicate}><Copy size={15} /></button>
          {attemptCount === 0 && <button className="icon-btn icon-btn--danger" aria-label="Delete exam" title="Delete" disabled={busy} onClick={remove}><Trash2 size={15} /></button>}
        </div>
      </div>

      {message && (
        <div className={message.tone === "ok" ? "form-message" : "take-error"} role="status">
          {message.text}
          {message.list && <ul>{message.list.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}

      <div className="builder-layout">
        <div>
          <nav className="tabs" role="tablist">
            {(["questions", "settings", "sittings"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "questions" ? "Questions" : t === "settings" ? "Settings" : `Sittings (${sessions.length})`}
              </button>
            ))}
          </nav>

          {tab === "questions" && (
            <div className="builder-sections">
              {locked && (
                <p className="take-warning"><Lock size={14} /> Candidates have started this exam, so questions are locked. Duplicate it to make changes.</p>
              )}
              {sections.map((section, sectionIndex) => (
                <section className="panel section-card" key={section.id}>
                  <div className="section-head">
                    <input
                      className="section-title"
                      defaultValue={section.title}
                      aria-label="Section title"
                      onBlur={(e) => e.target.value.trim() && e.target.value !== section.title && run(`/api/sections/${section.id}`, "PUT", { title: e.target.value.trim(), instructions: section.instructions })}
                    />
                    <span className="take-points">
                      {section.items.length + section.rules.reduce((n, r) => n + r.count, 0)} questions
                    </span>
                    {sections.length > 1 && !locked && (
                      <button className="icon-btn icon-btn--danger" aria-label="Delete section" onClick={() => window.confirm(`Delete ${section.title}?`) && run(`/api/sections/${section.id}`, "DELETE")}><Trash2 size={14} /></button>
                    )}
                  </div>

                  {section.items.length === 0 && section.rules.length === 0 && <p className="take-hint">No questions yet. Add fixed questions or a random draw from the bank.</p>}

                  {section.items.map((item, i) => (
                    <div className="builder-item" key={item.id}>
                      <span className="take-index">{sectionIndex + 1}.{i + 1}</span>
                      <div className="builder-item-text">
                        <Link href={`/questions/${item.questionId}`} className="dt-link">{item.text}</Link>
                        <small>
                          {item.typeLabel} · {item.difficulty.toLowerCase()} · v{item.version}
                          {item.questionStatus !== "APPROVED" && <span className="status-pill q-in_review">{item.questionStatus.replace("_", " ").toLowerCase()}</span>}
                        </small>
                      </div>
                      {item.latestVersion > item.version && !locked && (
                        <button className="outline-button small" title="Use the newest version of this question" onClick={() => run(`/api/section-items/${item.id}`, "PATCH", { useLatestVersion: true }, "Updated to the latest version.")}>
                          <RefreshCw size={12} /> v{item.latestVersion}
                        </button>
                      )}
                      <label className="marks-input">
                        <input type="number" min={0.25} max={100} step={0.25} defaultValue={item.points} disabled={locked} aria-label="Marks" onBlur={(e) => Number(e.target.value) !== item.points && run(`/api/section-items/${item.id}`, "PATCH", { points: Number(e.target.value) })} />
                        marks
                      </label>
                      {!locked && (
                        <span className="table-actions">
                          <button className="icon-btn" aria-label="Move up" disabled={i === 0 || busy} onClick={() => run(`/api/section-items/${item.id}`, "PATCH", { move: "up" })}><ArrowUp size={14} /></button>
                          <button className="icon-btn" aria-label="Move down" disabled={i === section.items.length - 1 || busy} onClick={() => run(`/api/section-items/${item.id}`, "PATCH", { move: "down" })}><ArrowDown size={14} /></button>
                          <button className="icon-btn icon-btn--danger" aria-label="Remove from exam" disabled={busy} onClick={() => run(`/api/section-items/${item.id}`, "DELETE")}><Trash2 size={14} /></button>
                        </span>
                      )}
                    </div>
                  ))}

                  {section.rules.map((rule) => (
                    <div className="builder-item rule" key={rule.id}>
                      <span className="take-index"><Shuffle size={12} /></span>
                      <div className="builder-item-text">
                        <strong>Draw {rule.count} random question{rule.count === 1 ? "" : "s"}</strong>
                        <small>
                          From {[rule.subject, rule.topic].filter(Boolean).join(" › ") || "the whole bank"}
                          {rule.difficulty ? ` · ${rule.difficulty.toLowerCase()}` : ""} · {rule.points} mark{rule.points === 1 ? "" : "s"} each ·{" "}
                          <span className={rule.available < rule.count ? "score-fail" : ""}>{rule.available} approved available</span>
                        </small>
                      </div>
                      {!locked && <button className="icon-btn icon-btn--danger" aria-label="Remove draw" onClick={() => run(`/api/selection-rules/${rule.id}`, "DELETE")}><Trash2 size={14} /></button>}
                    </div>
                  ))}

                  {ruleFor === section.id && <RuleForm subjects={options.subjects} onCancel={() => setRuleFor(null)} onSubmit={async (rule) => { if (await run(`/api/sections/${section.id}/rules`, "POST", rule)) setRuleFor(null); }} />}

                  {!locked && (
                    <div className="section-actions">
                      <button className="secondary-button" onClick={() => setPickerFor({ id: section.id, title: section.title })}><Plus size={14} /> Add questions</button>
                      <button className="outline-button" onClick={() => setRuleFor(section.id)}><Shuffle size={14} /> Add random draw</button>
                    </div>
                  )}
                </section>
              ))}
              {!locked && (
                <button className="outline-button add-section" onClick={() => run(`/api/exams/${settings.id}/sections`, "POST", { title: `Section ${String.fromCharCode(65 + sections.length)}` })}>
                  <Plus size={14} /> Add section
                </button>
              )}
            </div>
          )}

          {tab === "settings" && <ExamSettingsForm key={JSON.stringify(settings)} examId={settings.id} initial={settings} courses={options.courses} />}

          {tab === "sittings" && <Sittings examId={settings.id} sessions={sessions} labs={options.labs} run={run} />}
        </div>

        <aside className="panel checks-panel">
          <p className="eyebrow">PUBLISH CHECKS</p>
          {preflight.errors.length === 0 && preflight.warnings.length === 0 && (
            <p className="check ok"><CheckCircle2 size={15} /> Ready to publish.</p>
          )}
          {preflight.errors.map((e) => (
            <p className="check error" key={e}><AlertTriangle size={15} /> {e}</p>
          ))}
          {preflight.warnings.map((w) => (
            <p className="check warning" key={w}><AlertTriangle size={15} /> {w}</p>
          ))}
          <div className="aside-line"><span>Questions per candidate</span><strong>{preflight.questionCount}</strong></div>
          <div className="aside-line"><span>Total marks</span><strong>{preflight.maxScore}</strong></div>
          <div className="aside-line"><span>Pass mark</span><strong>{settings.passMarkPct}%</strong></div>
        </aside>
      </div>

      {pickerFor && (
        <QuestionPicker
          examId={settings.id}
          sectionTitle={pickerFor.title}
          inExam={inExam}
          onClose={() => setPickerFor(null)}
          onAdd={async (questionIds) => {
            const result = (await run(`/api/sections/${pickerFor.id}/items`, "POST", { questionIds })) as { added: number; skipped: number } | null;
            if (result) {
              setMessage({ tone: "ok", text: `Added ${result.added} question${result.added === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped)` : ""}.` });
              setPickerFor(null);
            }
          }}
        />
      )}
    </>
  );
}

type Subject = ExamBuilderData["options"]["subjects"][number];

function RuleForm({ subjects, onCancel, onSubmit }: { subjects: Subject[]; onCancel: () => void; onSubmit: (rule: unknown) => void }) {
  const [subjectId, setSubjectId] = useState("");
  const topics = subjects.find((s) => s.id === subjectId)?.topics ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      count: Number(form.get("count")),
      points: Number(form.get("points")),
      subjectId: subjectId || null,
      topicId: String(form.get("topicId") || "") || null,
      difficulty: String(form.get("difficulty") || "") || null,
    });
  }

  return (
    <form className="question-form rule-form" onSubmit={submit}>
      <div className="form-row four">
        <label>Questions to draw<input name="count" type="number" min={1} max={500} defaultValue={5} required /></label>
        <label>Marks each<input name="points" type="number" min={0.25} max={100} step={0.25} defaultValue={1} required /></label>
        <label>
          Subject
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Any subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          Topic
          <select name="topicId" disabled={!subjectId} defaultValue="">
            <option value="">Any topic</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Difficulty
          <select name="difficulty" defaultValue="">
            <option value="">Any difficulty</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
      </div>
      <div className="editor-actions">
        <button className="primary-button">Add draw</button>
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Sittings({
  examId,
  sessions,
  labs,
  run,
}: {
  examId: string;
  sessions: ExamBuilderData["sessions"];
  labs: { value: string; label: string }[];
  run: (url: string, method: string, body?: unknown, success?: string) => Promise<unknown>;
}) {
  const [accessCode, setAccessCode] = useState("");
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const ok = await run(
      `/api/exams/${examId}/sittings`,
      "POST",
      {
        name: form.get("name"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        accessCode: accessCode || null,
        labId: String(form.get("labId") || "") || null,
        lateJoinMin: form.get("lateJoinMin") ? Number(form.get("lateJoinMin")) : null,
        ipAllowlist: String(form.get("ipAllowlist") ?? "").split(/[\s,]+/).filter(Boolean),
      },
      "Sitting added.",
    );
    if (ok) {
      formEl.reset();
      setAccessCode("");
    }
  }

  return (
    <div className="builder-sections">
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">SCHEDULE</p><h2>Sittings</h2></div></div>
        <p className="take-hint">Without sittings, candidates can start the exam any time it is published. With sittings, they can only start inside a sitting window.</p>
        {sessions.length === 0 && <p className="take-loading">No sittings scheduled.</p>}
        {sessions.map((s) => (
          <div className="builder-item" key={s.id}>
            <div className="builder-item-text">
              <strong>{s.name}</strong>
              <small>
                {dateTime.format(new Date(s.startsAt))} – {dateTime.format(new Date(s.endsAt))}
                {s.lab ? ` · ${s.lab}` : ""}
                {s.accessCode ? ` · code ${s.accessCode}` : ""}
                {s.lateJoinMin !== null ? ` · late join ${s.lateJoinMin} min` : ""}
                {s.ipAllowlist.length ? ` · ${s.ipAllowlist.length} allowed IPs` : ""}
                {` · ${s.attempts} attempt${s.attempts === 1 ? "" : "s"}`}
              </small>
            </div>
            {s.attempts === 0 && <button className="icon-btn icon-btn--danger" aria-label="Delete sitting" onClick={() => run(`/api/sittings/${s.id}`, "DELETE")}><Trash2 size={14} /></button>}
          </div>
        ))}
      </section>

      <form className="question-form" onSubmit={submit}>
        <div className="form-heading"><div><p className="eyebrow">NEW SITTING</p><h2>Schedule a sitting</h2></div></div>
        <label>Name<input name="name" required placeholder="e.g. Morning batch, Lab 2" /></label>
        <div className="form-row">
          <label>Starts<input name="startsAt" type="datetime-local" required defaultValue={toLocalInput(now)} /></label>
          <label>Ends<input name="endsAt" type="datetime-local" required defaultValue={toLocalInput(new Date(now.getTime() + 2 * 3600_000))} /></label>
        </div>
        <div className="form-row">
          <label>
            Access code <span className="field-hint">Optional</span>
            <span className="inline-input">
              <input value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} maxLength={40} />
              <button type="button" className="outline-button small" onClick={() => setAccessCode(Math.random().toString(36).slice(2, 8).toUpperCase())}>Generate</button>
            </span>
          </label>
          <label>
            Late join (minutes) <span className="field-hint">Blank = until the end</span>
            <input name="lateJoinMin" type="number" min={0} max={600} />
          </label>
        </div>
        <label>
          Lab <span className="field-hint">Optional</span>
          <select name="labId" defaultValue="">
            <option value="">Any location</option>
            {labs.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <label>
          Allowed IP addresses <span className="field-hint">Optional. One per line; leave blank to allow any computer.</span>
          <textarea name="ipAllowlist" rows={2} placeholder={"192.168.1.21\n192.168.1.22"} />
        </label>
        <div className="editor-actions"><button className="primary-button">Add sitting<span>-&gt;</span></button></div>
      </form>
    </div>
  );
}
