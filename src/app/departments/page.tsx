"use client";

import { FormEvent, useEffect, useState } from "react";

type Department = {
  id: string;
  name: string;
  code: string;
  _count?: { courses: number; users: number };
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = async () => {
    const res = await fetch("/api/departments");
    const data = await res.json();
    if (res.ok) setDepartments(data.departments ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; // capture before await
    setPending(true);
    setMessage("");
    const formData = new FormData(form);
    const result = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        code: formData.get("code"),
      }),
    });
    setPending(false);
    const data = await result.json().catch(() => null);
    if (result.ok) {
      setMessage("Department created.");
      form.reset();
      load();
    } else {
      setMessage(data?.error ?? "Unable to create department.");
    }
  }

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <a className="back-link" href="/courses">&lt;- Back to courses</a>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Departments</h1>
          <p>Organise courses and students into academic departments.</p>
        </div>
      </div>

      <section className="authoring-layout">
        <form className="question-form" onSubmit={submit}>
          <div className="form-heading">
            <div><p className="eyebrow">NEW DEPARTMENT</p><h2>Create a department</h2></div>
          </div>
          <label>Department name<input name="name" required minLength={2} placeholder="e.g. Computer Science" /></label>
          <label>Department code<input name="code" required minLength={1} maxLength={15} placeholder="e.g. CS" /></label>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button save-question" disabled={pending}>{pending ? "Creating..." : "Create department"}<span>-&gt;</span></button>
        </form>

        <aside className="authoring-aside">
          <div className="aside-symbol">D</div>
          <h2>Departments group your academics.</h2>
          <p>Every course can belong to a department. Create the structure you need, then use it when building your courses.</p>
        </aside>
      </section>

      <section className="results-table">
        <div className="results-head"><span>Department</span><span>Code</span><span>Courses</span><span>Members</span></div>
        {loading && <p className="take-loading">Loading departments...</p>}
        {!loading && departments.length === 0 && <p className="take-loading">No departments yet.</p>}
        {!loading && departments.length > 0 && departments.map((d) => (
          <div className="results-row" key={d.id}>
            <strong>{d.name}</strong>
            <span>{d.code}</span>
            <span>{d._count?.courses ?? 0}</span>
            <span>{d._count?.users ?? 0}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
