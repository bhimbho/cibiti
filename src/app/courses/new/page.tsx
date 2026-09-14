"use client";

import { FormEvent, useEffect, useState } from "react";

type Department = { id: string; name: string; code: string };

export default function NewCoursePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/departments");
      const data = await res.json();
      if (res.ok) setDepartments(data.departments ?? []);
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; // capture before await (currentTarget is nulled after)
    setPending(true);
    setMessage("");
    const formData = new FormData(form);
    const result = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: formData.get("code"),
        title: formData.get("title"),
        credits: Number(formData.get("credits")),
        departmentId: formData.get("departmentId") || undefined,
      }),
    });
    setPending(false);
    const data = await result.json().catch(() => null);
    if (result.ok) {
      setMessage("Course created.");
      form.reset();
    } else {
      setMessage(data?.error ?? "Unable to create course.");
    }
  }

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <a className="back-link" href="/courses">&lt;- Back to courses</a>
          <p className="eyebrow">ACADEMICS</p>
          <h1>Create a course</h1>
          <p>Define a subject area, then enrol students and attach exams to it.</p>
        </div>
      </div>

      <section className="authoring-layout">
        <form className="question-form" onSubmit={submit}>
          <div className="form-heading">
            <div><p className="eyebrow">COURSE DETAILS</p><h2>New course</h2></div>
          </div>
          <label>Course code<input name="code" required minLength={2} maxLength={20} placeholder="e.g. CS101" /></label>
          <label>Course title<input name="title" required minLength={3} placeholder="e.g. Introduction to Computer Science" /></label>
          <div className="form-row">
            <label>Credits<input name="credits" type="number" min="0" max="30" defaultValue="3" /></label>
            <label>Department <span className="field-hint">Optional</span>
              <select name="departmentId" defaultValue="">
                <option value="">No department</option>
                {departments.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button save-question" disabled={pending}>{pending ? "Creating..." : "Create course"}<span>-&gt;</span></button>
        </form>

        <aside className="authoring-aside">
          <div className="aside-symbol">C</div>
          <h2>Courses tie everything together.</h2>
          <p>Every exam belongs to a course, and every student is enrolled in a course. Build your course, then invite students and attach assessments.</p>
        </aside>
      </section>
    </main>
  );
}
