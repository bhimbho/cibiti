"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      className="nav-item signout-button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
    >
      <LogOut className="nav-icon" size={15} strokeWidth={2} />Sign out
    </button>
  );
}
