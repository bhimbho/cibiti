"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { callApi } from "@/components/exam-builder/api";
import { roleLabels, type RoleKey } from "@/lib/people-table";

export type PersonFormValue = {
  name: string;
  email: string | null;
  regNumber: string | null;
  roles: RoleKey[];
  departmentId: string | null;
  levelId: string | null;
  groupIds: string[];
  isActive: boolean;
};

export type PersonFormOptions = {
  departments: { value: string; label: string }[];
  levels: { value: string; label: string }[];
  groups: { value: string; label: string }[];
  roles: RoleKey[];
};

export const emptyPerson: PersonFormValue = { name: "", email: null, regNumber: null, roles: ["CANDIDATE"], departmentId: null, levelId: null, groupIds: [], isActive: true };

export function PasswordReveal({ signIn, password, children }: { signIn: string; password: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="password-reveal" role="status">
      <p className="eyebrow">SHARE THESE SIGN-IN DETAILS NOW</p>
      <div className="credential"><span>Sign in with</span><strong>{signIn}</strong></div>
      <div className="credential">
        <span>Password</span>
        <strong className="mono">{password}</strong>
        <button
          type="button"
          className="icon-btn"
          aria-label="Copy password"
          onClick={async () => {
            await navigator.clipboard?.writeText(password).catch(() => undefined);
            setCopied(true);
          }}
        >
          <Copy size={14} />
        </button>
        {copied && <small>Copied</small>}
      </div>
      <p className="take-hint">This password will not be shown again. It can be reset later from the person&apos;s page.</p>
      {children}
    </div>
  );
}

export function PersonForm({ userId, initial, options, isSelf }: { userId?: string; initial: PersonFormValue; options: PersonFormOptions; isSelf?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<{ id: string; password: string | null } | null>(null);

  const set = <K extends keyof PersonFormValue>(key: K, next: PersonFormValue[K]) => setValue((v) => ({ ...v, [key]: next }));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  // Roles the viewer cannot grant stay visible (read-only) so nothing looks silently removed.
  const shownRoles = [...new Set([...options.roles, ...initial.roles])];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const body = { ...value, email: value.email || null, regNumber: value.regNumber || null, password: password || null };
    if (userId) {
      const result = await callApi(`/api/people/${userId}`, "PUT", body);
      setPending(false);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setPassword("");
      setMessage({ tone: "ok", text: "Changes saved." });
      router.refresh();
      return;
    }
    const result = await callApi<{ person: { id: string; generatedPassword: string | null } }>("/api/people", "POST", body);
    setPending(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setCreated({ id: result.data.person.id, password: result.data.person.generatedPassword });
  }

  if (created) {
    return (
      <section className="question-form">
        <div className="form-heading"><div><p className="eyebrow">ACCOUNT CREATED</p><h2>{value.name}</h2></div></div>
        {created.password ? (
          <PasswordReveal signIn={value.regNumber || value.email || ""} password={created.password} />
        ) : (
          <p className="form-message">The account uses the password you entered.</p>
        )}
        <div className="editor-actions">
          <Link className="primary-button" href={`/people/${created.id}`}>Open profile<span>-&gt;</span></Link>
          <button type="button" className="outline-button" onClick={() => { setCreated(null); setValue({ ...emptyPerson, departmentId: value.departmentId, levelId: value.levelId, roles: value.roles }); setPassword(""); }}>Add another</button>
        </div>
      </section>
    );
  }

  return (
    <form className="question-form" onSubmit={submit}>
      <label>Full name<input value={value.name} onChange={(e) => set("name", e.target.value)} required minLength={2} autoComplete="off" /></label>
      <div className="form-row">
        <label>Matric / registration number <span className="field-hint">Candidates sign in with this</span><input value={value.regNumber ?? ""} onChange={(e) => set("regNumber", e.target.value)} autoComplete="off" placeholder="e.g. CSC/2026/014" /></label>
        <label>Email <span className="field-hint">Required for staff</span><input type="email" value={value.email ?? ""} onChange={(e) => set("email", e.target.value)} autoComplete="off" /></label>
      </div>

      <fieldset className="editor-fieldset">
        <legend>Roles</legend>
        <div className="role-grid">
          {shownRoles.map((role) => {
            const grantable = options.roles.includes(role);
            return (
              <label key={role} className={`check-label ${grantable ? "" : "muted"}`}>
                <input type="checkbox" checked={value.roles.includes(role)} disabled={!grantable} onChange={() => set("roles", toggle(value.roles, role) as RoleKey[])} />
                {roleLabels[role]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="form-row">
        <label>
          Department
          <select value={value.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)}>
            <option value="">None</option>
            {options.departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label>
          Level / class
          <select value={value.levelId ?? ""} onChange={(e) => set("levelId", e.target.value || null)}>
            <option value="">None</option>
            {options.levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
      </div>

      {options.groups.length > 0 && (
        <fieldset className="editor-fieldset">
          <legend>Groups <span className="field-hint">Class arms or centre batches</span></legend>
          <div className="role-grid">
            {options.groups.map((g) => (
              <label key={g.value} className="check-label">
                <input type="checkbox" checked={value.groupIds.includes(g.value)} onChange={() => set("groupIds", toggle(value.groupIds, g.value))} />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label>
        {userId ? "Set a new password" : "Password"} <span className="field-hint">{userId ? "Leave blank to keep the current password" : "Leave blank to generate one"}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" />
      </label>

      {userId && (
        <label className="check-label">
          <input type="checkbox" checked={value.isActive} disabled={isSelf} onChange={(e) => set("isActive", e.target.checked)} /> Account active {isSelf && <span className="field-hint">(you cannot deactivate yourself)</span>}
        </label>
      )}

      {message && <p className={message.tone === "ok" ? "form-message" : "take-error"} role="status">{message.text}</p>}
      <div className="editor-actions">
        <button className="primary-button" disabled={pending}>{pending ? "Saving…" : userId ? "Save changes" : "Create account"}<span>-&gt;</span></button>
        <Link className="text-button" href="/people">Cancel</Link>
      </div>
    </form>
  );
}
