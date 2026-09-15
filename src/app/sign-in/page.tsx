"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirect: false,
    }).catch(() => ({ error: "network" }));
    setPending(false);
    if (result?.error) {
      setError(result.error === "network" ? "Cannot reach the server. Check the network and try again." : "Those sign-in details are not correct.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark">C</span><span>Cibiti</span></div>
        <p className="eyebrow auth-eyebrow">ASSESSMENT WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="auth-copy">Staff sign in with email. Candidates can use their matric or registration number.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="identifier">Email or matric number</label>
          <input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" required placeholder="you@school.edu or CSC/2026/001" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<span>-&gt;</span></button>
        </form>
      </section>
    </main>
  );
}
