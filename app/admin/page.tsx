/**
 * Dashboard de validation (PRD §31).
 *
 * Trois files : signalements rattachés, signalements sans rattachement,
 * contradictions. Rien n'est publié sans passer par ici.
 */

import Link from "next/link";
import { all, getDb } from "@/lib/db/index";
import { STATUS_COLORS, STATUS_LABELS, type DisplayStatus } from "@/types";
import { acceptEvent, rejectEvent, resolveUnmatched } from "./actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default function AdminPage() {
  const db = getDb();

  const pending = all<Row>(
    db,
    `SELECT e.id, e.status, e.description, e.confidence_level, e.event_date,
            s.uai, s.name AS school_name, s.city,
            src.url, src.title, src.publisher, src.source_type, src.published_at
       FROM mobilization_events e
       JOIN schools s ON s.id = e.school_id
       LEFT JOIN event_sources es ON es.event_id = e.id
       LEFT JOIN sources src ON src.id = es.source_id
      WHERE e.review_state = 'pending'
      ORDER BY e.event_date DESC
      LIMIT 100`,
  );

  const unmatched = all<Row>(
    db,
    `SELECT r.id, r.quoted_name, r.proposed_status, r.extract, r.match_kind,
            r.match_reason, r.candidates, src.url, src.title, src.publisher
       FROM unmatched_reports r
       JOIN sources src ON src.id = r.source_id
      WHERE r.review_state = 'pending'
      ORDER BY r.created_at DESC
      LIMIT 100`,
  );

  const contradictions = all<Row>(
    db,
    `SELECT s.uai, s.name, s.city, c.status, c.confidence_reason, c.last_event_date
       FROM school_current c
       JOIN schools s ON s.id = c.school_id
      WHERE c.status = 'CONTRADICTOIRE'
      ORDER BY c.updated_at DESC
      LIMIT 50`,
  );

  const done = all<Row>(
    db,
    `SELECT review_state, COUNT(*) n FROM mobilization_events GROUP BY review_state`,
  );

  const counts = Object.fromEntries(done.map((r) => [String(r.review_state), Number(r.n)]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Validation</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {pending.length} signalement(s) rattachés en attente · {unmatched.length} sans
        rattachement · {contradictions.length} contradiction(s) · {counts.accepted ?? 0}{" "}
        validés · {counts.rejected ?? 0} rejetés
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-500">
        Un signalement entrant n&apos;est jamais publié comme fait confirmé. La confiance
        proposée par le pipeline est systématiquement rétrogradée : seul un vérificateur
        peut la faire monter.
      </p>

      <Section title="Signalements rattachés (en attente de validation)">
        {pending.length === 0 ? (
          <Empty>Aucun signalement en attente. Lancez `node scripts/ingest.ts &lt;fichier.json&gt;`.</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((e) => (
              <li key={String(e.id)} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                    style={{ background: STATUS_COLORS[String(e.status) as DisplayStatus] }}
                  />
                  <span className="text-sm font-medium">
                    {STATUS_LABELS[String(e.status) as DisplayStatus]}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700">
                    confiance proposée {String(e.confidence_level)}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    détecté le {String(e.event_date).slice(0, 16).replace("T", " ")}
                  </span>
                </div>

                <p className="mt-2 text-sm text-neutral-800">{String(e.description)}</p>

                <p className="mt-1 text-xs text-neutral-600">
                  Rattaché à{" "}
                  <Link href={`/schools/${e.uai}`} className="underline underline-offset-2">
                    {String(e.school_name)} — {String(e.city)}
                  </Link>{" "}
                  (UAI {String(e.uai)})
                </p>

                {e.url ? (
                  <p className="mt-1 text-xs text-neutral-600">
                    Source :{" "}
                    <a
                      href={String(e.url)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-neutral-900 underline underline-offset-2"
                    >
                      {String(e.title ?? e.url)}
                    </a>{" "}
                    · {String(e.publisher ?? e.source_type)} ·{" "}
                    {e.published_at ? String(e.published_at).slice(0, 10) : "date inconnue"}
                  </p>
                ) : null}

                <form className="mt-3 flex flex-wrap items-end gap-2" action={acceptEvent}>
                  <input type="hidden" name="event_id" value={String(e.id)} />
                  <label className="flex-1 text-[11px] text-neutral-600">
                    Justification (obligatoire, §30)
                    <input
                      name="reason"
                      required
                      placeholder="ex. confirmé par la mairie, communiqué du 6 octobre"
                      className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[11px] text-neutral-600">
                    Vérificateur
                    <input
                      name="reviewer"
                      defaultValue="anonyme"
                      className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                  >
                    Valider
                  </button>
                  <button
                    type="submit"
                    formAction={rejectEvent}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100"
                  >
                    Rejeter
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Signalements sans rattachement (aucun UAI trouvé)">
        {unmatched.length === 0 ? (
          <Empty>Aucun signalement en attente de rattachement.</Empty>
        ) : (
          <ul className="space-y-3">
            {unmatched.map((r) => {
              let cands: Array<{ uai: string; name: string; city: string }> = [];
              try {
                cands = JSON.parse(String(r.candidates ?? "[]")) as typeof cands;
              } catch {
                cands = [];
              }
              return (
                <li key={String(r.id)} className="rounded-lg border border-amber-300 bg-amber-50/50 p-4">
                  <p className="text-xs font-medium text-amber-900">
                    {String(r.match_kind)} — rattachement refusé automatiquement
                  </p>
                  <p className="mt-1 text-xs text-neutral-700">{String(r.match_reason)}</p>
                  <p className="mt-2 text-sm text-neutral-800">{String(r.extract)}</p>

                  {cands.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-neutral-600">
                      {cands.map((c) => (
                        <li key={c.uai}>
                          {c.uai} — {c.name}, {c.city}
                        </li>
                      ))}
                    </ul>
                  )}

                  <form className="mt-3 flex flex-wrap items-end gap-2" action={resolveUnmatched}>
                    <input type="hidden" name="report_id" value={String(r.id)} />
                    <label className="text-[11px] text-neutral-600">
                      UAI retenu
                      <input
                        name="uai"
                        placeholder="0330026Z"
                        className="mt-1 w-28 rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <label className="text-[11px] text-neutral-600">
                      Vérificateur
                      <input
                        name="reviewer"
                        defaultValue="anonyme"
                        className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                    >
                      Rattacher
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Contradictions en cours">
        {contradictions.length === 0 ? (
          <Empty>Aucune contradiction active.</Empty>
        ) : (
          <ul className="space-y-2">
            {contradictions.map((c) => (
              <li key={String(c.uai)} className="rounded border border-red-200 bg-red-50 p-3 text-xs">
                <Link href={`/schools/${c.uai}`} className="font-medium underline underline-offset-2">
                  {String(c.name)} — {String(c.city)}
                </Link>
                <span className="ml-2 text-red-900">
                  {String(c.confidence_reason)} (vérifié le{" "}
                  {String(c.last_event_date ?? "").slice(0, 16).replace("T", " ")})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}
