import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { AccommodationForm, ResetPassword } from "@/components/people/person-extras";
import { requirePagePermission } from "@/server/page-auth";
import { getPersonForEditing, peopleFormOptions } from "@/server/people/mutate";

export const metadata: Metadata = { title: "Person | Cibiti" };

const dateTime = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("people:manage");
  const { id } = await params;
  const [person, options] = await Promise.all([getPersonForEditing(actor, id), peopleFormOptions(actor)]);
  if (!person) notFound();

  const isCandidate = person.input.roles.includes("CANDIDATE");

  return (
    <main className="authoring-page wide">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/people">&lt;- Back to people</Link>
          <p className="eyebrow">PEOPLE</p>
          <h1>{person.input.name}</h1>
          <p>{[person.input.regNumber, person.input.email].filter(Boolean).join(" · ")}{person.input.isActive ? "" : " · deactivated"}</p>
        </div>
      </div>

      <div className="builder-layout">
        <PersonForm userId={person.id} initial={person.input} options={options} isSelf={person.id === actor.userId} />

        <aside className="builder-sections">
          <section className="panel">
            <p className="eyebrow">PASSWORD</p>
            <ResetPassword userId={person.id} signIn={person.input.regNumber ?? person.input.email ?? ""} />
          </section>

          {isCandidate && (
            <section className="panel">
              <p className="eyebrow">ACCOMMODATION</p>
              <AccommodationForm userId={person.id} initial={person.accommodation} />
            </section>
          )}

          {isCandidate && (
            <section className="panel">
              <p className="eyebrow">COURSES</p>
              {person.enrollments.length === 0 && <p className="take-hint">Not registered on any course.</p>}
              {person.enrollments.map((e) => (
                <div className="aside-line" key={e.id}><span>{e.code}</span><strong>{e.title}</strong></div>
              ))}
            </section>
          )}

          {person.attempts.length > 0 && (
            <section className="panel">
              <p className="eyebrow">RECENT ATTEMPTS</p>
              {person.attempts.map((a) => (
                <div className="aside-line" key={a.id}>
                  <span><Link className="dt-link" href={`/results/${a.id}`}>{a.exam}</Link><br />{dateTime.format(new Date(a.startedAt))}</span>
                  <strong>{a.percent === null ? a.status.replace("_", " ").toLowerCase() : `${Math.round(a.percent)}%`}</strong>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
