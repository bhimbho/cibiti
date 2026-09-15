"use client";

import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, ClipboardList, Database, LayoutDashboard, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import type { NavIcon, NavItem } from "@/components/nav";

const icons: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  questions: Database,
  exams: ClipboardList,
  people: Users,
  academics: BookOpen,
  results: BarChart3,
  invigilation: ShieldCheck,
  settings: Settings,
};

export function Sidebar({ name, roleLabel, orgName, nav }: { name: string; roleLabel: string; orgName: string; nav: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">C</span>
        <span>Cibiti</span>
      </div>
      <div className="workspace-label">{orgName.toUpperCase()}</div>
      <nav className="nav-list" aria-label="Main navigation">
        {nav.map((item) => {
          const Icon = icons[item.icon];
          return (
            <a key={item.href} className={`nav-item ${isActive(item.href) ? "active" : ""}`} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
              <Icon className="nav-icon" size={15} strokeWidth={2} />
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <SignOutButton />
        <div className="profile">
          <div className="avatar">{initials || "U"}</div>
          <div>
            <strong>{name}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
