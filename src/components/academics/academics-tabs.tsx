import Link from "next/link";

export function AcademicsTabs({ active }: { active: "structure" | "courses" }) {
  return (
    <nav className="tabs page-tabs" aria-label="Academics sections">
      <Link href="/academics" className={active === "structure" ? "active" : ""} aria-current={active === "structure" ? "page" : undefined}>Structure</Link>
      <Link href="/academics/courses" className={active === "courses" ? "active" : ""} aria-current={active === "courses" ? "page" : undefined}>Courses</Link>
    </nav>
  );
}
