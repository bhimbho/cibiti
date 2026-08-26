"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }),
    });
    const data = await res.json();
    if (!res.ok) { setPending(false); setError(data.error ?? "Unable to create account."); return; }
    setMessage("Account created. Signing you in...");
    await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false });
    window.location.assign("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/" aria-label="Back to Cibiti home"><span className="brand-mark">C</span><span>Cibiti</span></a>
        <p className="eyebrow auth-eyebrow">STUDENT WORKSPACE</p>
        <h1>Create your account.</h1>
        <p className="auth-copy">Start taking assessments and tracking your progress.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" type="text" autoComplete="name" required minLength={2} placeholder="Your name" />
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={pending}>{pending ? "Creating account..." : "Create account"}<span>-&gt;</span></button>
        </form>
        <p className="auth-footer">Already have an account? <a href="/sign-in">Sign in</a></p>
      </section>
    </main>
  );
}
