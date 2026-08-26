"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="nav-item signout-button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
    >
      <span className="nav-icon">↩</span>Sign out
    </button>
  );
}
