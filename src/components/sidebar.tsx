"use client";

import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { useEffect, useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const [userData, setUserData] = useState<{ role: string; name: string | null } | null>(null);

  // Hide sidebar when taking an exam
  if (pathname?.includes("/take") || pathname?.includes("/adaptive")) {
    return null;
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (res.ok) setUserData({ role: json.role, name: json.name });
    })();
  }, []);

  const isStudent = userData?.role === "STUDENT";

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">C</span>
        <span>Cibiti</span>
      </div>
      <div className="workspace-label">MY WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        <a className={`nav-item ${pathname === "/" ? "active" : ""}`} href="/">
          <span className="nav-icon">+</span>Overview
        </a>
        <a className={`nav-item ${pathname.startsWith("/courses") ? "active" : ""}`} href="/courses">
          <span className="nav-icon">◎</span>Courses
        </a>
        <a className={`nav-item ${pathname.startsWith("/exams") ? "active" : ""}`} href="/exams">
          <span className="nav-icon">[]</span>My exams
        </a>
        <a className={`nav-item ${pathname.startsWith("/results") ? "active" : ""}`} href="/results">
          <span className="nav-icon">/</span>Results
        </a>
        {!isStudent && (
          <>
            <a className={`nav-item ${pathname.startsWith("/students") ? "active" : ""}`} href="/students">
              <span className="nav-icon">§</span>Students
            </a>
            <a className={`nav-item ${pathname.startsWith("/departments") ? "active" : ""}`} href="/departments">
              <span className="nav-icon">◈</span>Departments
            </a>
            <a className={`nav-item ${pathname.startsWith("/question-bank") ? "active" : ""}`} href="/question-bank">
              <span className="nav-icon">*</span>Question bank
            </a>
            <a className={`nav-item ${pathname === "/exams/new" ? "active" : ""}`} href="/exams/new">
              <span className="nav-icon">E</span>Create exam
            </a>
            <a className={`nav-item ${pathname.startsWith("/analytics") ? "active" : ""}`} href="/analytics">
              <span className="nav-icon">%</span>Analytics
            </a>
          </>
        )}
      </nav>
      <div className="sidebar-bottom">
        <SignOutButton />
        <div className="profile">
          <div className="avatar">{(userData?.name ?? "U").slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{userData?.name ?? "Guest"}</strong>
            <span>{isStudent ? "Student account" : "Instructor account"}</span>
          </div>
          <span className="more">...</span>
        </div>
      </div>
    </aside>
  );
}
