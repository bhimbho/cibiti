import type { Metadata } from "next";
import Link from "next/link";
import { emptyPerson, PersonForm } from "@/components/people/person-form";
import { requirePagePermission } from "@/server/page-auth";
import { peopleFormOptions } from "@/server/people/mutate";

export const metadata: Metadata = { title: "Add person | Cibiti" };

export default async function NewPersonPage() {
  const actor = await requirePagePermission("people:manage");
  const options = await peopleFormOptions(actor);

  return (
    <main className="authoring-page">
      <div className="authoring-header">
        <div>
          <Link className="back-link" href="/people">&lt;- Back to people</Link>
          <p className="eyebrow">PEOPLE</p>
          <h1>Add a person</h1>
          <p>Candidates sign in with their matric number; staff sign in with email.</p>
        </div>
      </div>
      <section className="single-form">
        <PersonForm initial={emptyPerson} options={options} />
      </section>
    </main>
  );
}
