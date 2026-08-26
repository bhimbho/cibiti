"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      setError("The email or password is incorrect.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/" aria-label="Back to Cibiti home"><span className="brand-mark">C</span><span>Cibiti</span></a>
        <p className="eyebrow auth-eyebrow">STUDENT WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="auth-copy">Sign in to continue your assessment journey.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} placeholder="At least 8 characters" />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<span>-&gt;</span></button>
        </form>
        <p className="auth-footer">New to Cibiti? <a href="#register">Create a student account</a></p>
      </section>
    </main>
  );
}
