"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Trash2 } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";
import type { AcademicStructure } from "@/server/academics/structure";

type Run = (url: string, method: string, body?: unknown, success?: string) => Promise<boolean>;

function useRunner() {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run: Run = async (url, method, body, success) => {
    setMessage(null);
    const result = await callApi(url, method, body);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return false;
    }
    if (success) setMessage({ tone: "ok", text: success });
    router.refresh();
    return true;
  };
  return { run, message };
}

/** A text input that saves when it loses focus, if its value changed. */
function InlineName({ value, label, onSave }: { value: string; label: string; onSave: (next: string) => void }) {
  return (
    <input
      className="inline-name"
      defaultValue={value}
      aria-label={label}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next && next !== value) onSave(next);
        else e.target.value = value;
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Panel({ eyebrow, title, hint, children }: { eyebrow: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="panel structure-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="take-hint">{hint}</p>
      {children}
    </section>
  );
}

function AddForm({ children, onSubmit, label }: { children: ReactNode; onSubmit: (form: FormData, el: HTMLFormElement) => Promise<boolean>; label: string }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const el = event.currentTarget;
    if (await onSubmit(new FormData(el), el)) el.reset();
  }
  return (
    <form className="structure-add" onSubmit={submit}>
      {children}
      <button className="secondary-button" aria-label={label}><Plus size={14} /> Add</button>
    </form>
  );
}

const confirmDelete = (what: string) => window.confirm(`Delete ${what}? This cannot be undone.`);

export function StructureManager({ data }: { data: AcademicStructure }) {
  const { run, message } = useRunner();
  const api = (kind: string, id?: string) => `/api/academics/${kind}${id ? `/${id}` : ""}`;

  return (
    <>
      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <div className="structure-grid">
        <Panel eyebrow="ORGANISATION" title="Departments" hint="Courses and people can belong to a department.">
          <ul className="structure-list">
            {data.departments.map((d) => (
              <li key={d.id}>
                <span className="code-chip">{d.code}</span>
                <InlineName value={d.name} label={`Rename ${d.code}`} onSave={(name) => run(api("departments", d.id), "PUT", { name, code: d.code })} />
                <small>{d.courses} courses · {d.people} people</small>
                <button className="icon-btn icon-btn--danger" aria-label={`Delete ${d.name}`} onClick={() => confirmDelete(d.name) && run(api("departments", d.id), "DELETE")}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
          <AddForm label="Add department" onSubmit={(f) => run(api("departments"), "POST", { code: f.get("code"), name: f.get("name") }, "Department added.")}>
            <input name="code" placeholder="Code" aria-label="Department code" required maxLength={15} className="short" />
            <input name="name" placeholder="Department name" aria-label="Department name" required minLength={2} />
          </AddForm>
        </Panel>

        <Panel eyebrow="ORGANISATION" title="Levels & classes" hint="e.g. 100L–500L, JSS1–SS3, or a centre programme. Order controls sorting.">
          <ul className="structure-list">
            {data.levels.map((l) => (
              <li key={l.id}>
                <input
                  className="order-input"
                  type="number"
                  defaultValue={l.order}
                  aria-label={`Order of ${l.name}`}
                  onBlur={(e) => Number(e.target.value) !== l.order && run(api("levels", l.id), "PUT", { name: l.name, order: Number(e.target.value) })}
                />
                <InlineName value={l.name} label={`Rename ${l.name}`} onSave={(name) => run(api("levels", l.id), "PUT", { name, order: l.order })} />
                <small>{l.people} people · {l.groups} groups</small>
                <button className="icon-btn icon-btn--danger" aria-label={`Delete ${l.name}`} onClick={() => confirmDelete(l.name) && run(api("levels", l.id), "DELETE")}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
          <AddForm label="Add level" onSubmit={(f) => run(api("levels"), "POST", { name: f.get("name"), order: data.levels.length + 1 }, "Level added.")}>
            <input name="name" placeholder="e.g. 300L or JSS2" aria-label="Level name" required />
          </AddForm>
        </Panel>

        <Panel eyebrow="ORGANISATION" title="Groups, arms & batches" hint="Assign exams to a group such as JSS2B or a CBT centre morning batch.">
          <ul className="structure-list">
            {data.groups.map((g) => (
              <li key={g.id}>
                <InlineName value={g.name} label={`Rename ${g.name}`} onSave={(name) => run(api("groups", g.id), "PUT", { name, levelId: g.levelId })} />
                <small>{g.level ?? "No level"} · {g.members} members</small>
                <button className="icon-btn icon-btn--danger" aria-label={`Delete ${g.name}`} onClick={() => confirmDelete(`${g.name} and its member list`) && run(api("groups", g.id), "DELETE")}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
          <AddForm label="Add group" onSubmit={(f) => run(api("groups"), "POST", { name: f.get("name"), levelId: f.get("levelId") || null }, "Group added.")}>
            <input name="name" placeholder="e.g. JSS2B" aria-label="Group name" required />
            <select name="levelId" aria-label="Group level" defaultValue="">
              <option value="">No level</option>
              {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </AddForm>
        </Panel>

        <Panel eyebrow="CALENDAR" title="Sessions & terms" hint="The current session's first term is used when candidates are registered on courses.">
          {data.sessions.map((s) => (
            <div className="nested" key={s.id}>
              <div className="nested-head">
                <InlineName value={s.name} label={`Rename ${s.name}`} onSave={(name) => run(api("sessions", s.id), "PUT", { name, startsOn: s.startsOn, endsOn: s.endsOn })} />
                {s.isCurrent ? (
                  <span className="status-pill e-published"><Star size={11} /> Current</span>
                ) : (
                  <button className="outline-button small" onClick={() => run(api("sessions", s.id), "PATCH", { action: "make-current" }, `${s.name} is now the current session.`)}>Make current</button>
                )}
                <button className="icon-btn icon-btn--danger" aria-label={`Delete ${s.name}`} onClick={() => confirmDelete(`${s.name} and its terms`) && run(api("sessions", s.id), "DELETE")}><Trash2 size={13} /></button>
              </div>
              <ul className="structure-list child">
                {s.terms.map((t) => (
                  <li key={t.id}>
                    <InlineName value={t.name} label={`Rename ${t.name}`} onSave={(name) => run(api("terms", t.id), "PUT", { sessionId: s.id, name, order: t.order })} />
                    <small>{t.exams} exams</small>
                    <button className="icon-btn icon-btn--danger" aria-label={`Delete ${t.name}`} onClick={() => confirmDelete(t.name) && run(api("terms", t.id), "DELETE")}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
              <AddForm label={`Add term to ${s.name}`} onSubmit={(f) => run(api("terms"), "POST", { sessionId: s.id, name: f.get("name"), order: s.terms.length + 1 }, "Term added.")}>
                <input name="name" placeholder="e.g. Second Semester" aria-label={`New term for ${s.name}`} required />
              </AddForm>
            </div>
          ))}
          <AddForm label="Add session" onSubmit={(f) => run(api("sessions"), "POST", { name: f.get("name") }, "Session added.")}>
            <input name="name" placeholder="e.g. 2027/2028" aria-label="Session name" required minLength={3} />
          </AddForm>
        </Panel>

        <Panel eyebrow="EXAM HALLS" title="Venues & labs" hint="Labs can be attached to sittings. Capacity helps plan seat allocation.">
          {data.venues.map((v) => (
            <div className="nested" key={v.id}>
              <div className="nested-head">
                <InlineName value={v.name} label={`Rename ${v.name}`} onSave={(name) => run(api("venues", v.id), "PUT", { name })} />
                <button className="icon-btn icon-btn--danger" aria-label={`Delete ${v.name}`} onClick={() => confirmDelete(`${v.name} and its labs`) && run(api("venues", v.id), "DELETE")}><Trash2 size={13} /></button>
              </div>
              <ul className="structure-list child">
                {v.labs.map((l) => (
                  <li key={l.id}>
                    <InlineName value={l.name} label={`Rename ${l.name}`} onSave={(name) => run(api("labs", l.id), "PUT", { venueId: v.id, name, capacity: l.capacity })} />
                    <input
                      className="order-input"
                      type="number"
                      min={0}
                      defaultValue={l.capacity}
                      aria-label={`Capacity of ${l.name}`}
                      onBlur={(e) => Number(e.target.value) !== l.capacity && run(api("labs", l.id), "PUT", { venueId: v.id, name: l.name, capacity: Number(e.target.value) })}
                    />
                    <small>seats · {l.sittings} sittings</small>
                    <button className="icon-btn icon-btn--danger" aria-label={`Delete ${l.name}`} onClick={() => confirmDelete(l.name) && run(api("labs", l.id), "DELETE")}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
              <AddForm label={`Add lab to ${v.name}`} onSubmit={(f) => run(api("labs"), "POST", { venueId: v.id, name: f.get("name"), capacity: Number(f.get("capacity") || 0) }, "Lab added.")}>
                <input name="name" placeholder="Lab name" aria-label={`New lab for ${v.name}`} required />
                <input name="capacity" type="number" min={0} placeholder="Seats" aria-label={`Seats in new lab for ${v.name}`} className="short" />
              </AddForm>
            </div>
          ))}
          <AddForm label="Add venue" onSubmit={(f) => run(api("venues"), "POST", { name: f.get("name") }, "Venue added.")}>
            <input name="name" placeholder="e.g. ICT Centre" aria-label="Venue name" required />
          </AddForm>
        </Panel>
      </div>
    </>
  );
}
