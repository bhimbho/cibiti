"use client";

import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  BarChart3,
  GraduationCap,
  Building2,
  Database,
  PieChart,
} from "lucide-react";

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
          <LayoutDashboard className="nav-icon" size={15} strokeWidth={2} />Overview
        </a>
        <a className={`nav-item ${pathname.startsWith("/courses") ? "active" : ""}`} href="/courses">
          <BookOpen className="nav-icon" size={15} strokeWidth={2} />Courses
        </a>
        <a className={`nav-item ${pathname.startsWith("/exams") ? "active" : ""}`} href="/exams">
          <ClipboardList className="nav-icon" size={15} strokeWidth={2} />My exams
        </a>
        <a className={`nav-item ${pathname.startsWith("/results") ? "active" : ""}`} href="/results">
          <BarChart3 className="nav-icon" size={15} strokeWidth={2} />Results
        </a>
        {!isStudent && (
          <>
            <a className={`nav-item ${pathname.startsWith("/students") ? "active" : ""}`} href="/students">
              <GraduationCap className="nav-icon" size={15} strokeWidth={2} />Students
            </a>
            <a className={`nav-item ${pathname.startsWith("/departments") ? "active" : ""}`} href="/departments">
              <Building2 className="nav-icon" size={15} strokeWidth={2} />Departments
            </a>
            <a className={`nav-item ${pathname.startsWith("/question-bank") ? "active" : ""}`} href="/question-bank">
              <Database className="nav-icon" size={15} strokeWidth={2} />Question bank
            </a>
            <a className={`nav-item ${pathname.startsWith("/analytics") ? "active" : ""}`} href="/analytics">
              <PieChart className="nav-icon" size={15} strokeWidth={2} />Analytics
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
