"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Certificate = { studentName: string; examTitle: string; score: number | null; maxScore: number | null; pct: number; issuedAt: string | null };

export default function CertificatePage() {
  const params = useParams<{ id: string }>();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/certificates/${params.id}`);
      const data = await res.json();
      if (res.ok) setCert(data.certificate);
      else setError(data.error ?? "Certificate unavailable.");
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <main className="auth-page"><p className="take-loading">Preparing certificate...</p></main>;
  if (error) return <main className="auth-page"><section className="auth-card"><h1>Certificate unavailable</h1><p className="auth-copy">{error}</p><a className="primary-button auth-submit" href="/results">Back to results<span>-&gt;</span></a></section></main>;

  return (
    <main className="auth-page">
      <section className="certificate">
        <div className="cert-border">
          <p className="cert-eyebrow">C I B I T I</p>
          <h1>Certificate of Completion</h1>
          <p className="cert-award">This certifies that</p>
          <p className="cert-name">{cert?.studentName}</p>
          <p className="cert-award">has successfully completed the assessment</p>
          <p className="cert-exam">{cert?.examTitle}</p>
          <div className="cert-score"><strong>{cert?.pct}%</strong><span>{cert?.score} / {cert?.maxScore} points</span></div>
          <p className="cert-date">Issued {cert?.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : "—"}</p>
        </div>
        <div className="cert-actions">
          <button className="primary-button" onClick={() => window.print()}>Print certificate<span>-&gt;</span></button>
          <a className="outline-button" href="/results">Back to results</a>
        </div>
      </section>
    </main>
  );
}
