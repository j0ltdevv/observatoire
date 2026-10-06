/**
 * Sources : registre public de tout ce qui a été collecté.
 * Chaque ligne est vérifiable (PRD §25 point 5, §31).
 */

import Link from "next/link";
import { getDb } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const TYPE_LABELS: Record<string, string> = {
  official: "Officielle",
  school: "Établissement",
  prefecture: "Préfecture",
  local_media: "Presse locale",
  national_media: "Presse nationale",
  organization: "Organisation",
  public_statement: "Communiqué",
  other: "Autre",
};

const fr = (v: unknown): string => {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
};

export default function SourcesPage() {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) n FROM sources").get() as Row).n as number;
  const byType = db
    .prepare(
      `SELECT source_type, COUNT(*) n FROM sources GROUP BY source_type ORDER BY n DESC`,
    )
    .all() as Array<{ source_type: string; n: number }>;

  const pending = (db
    .prepare(`SELECT COUNT(*) n FROM mobilization_events WHERE review_state = 'pending'`)
    .get() as Row).n as number;
  const accepted = (db
    .prepare(`SELECT COUNT(*) n FROM mobilization_events WHERE review_state = 'accepted'`)
    .get() as Row).n as number;

  const recent = db
    .prepare(
      `SELECT s.id, s.url, s.title, s.publisher, s.source_type, s.published_at, s.retrieved_at,
              (SELECT COUNT(*) FROM event_sources es WHERE es.source_id = s.id) nb_events,
              (SELECT e2.status FROM event_sources es
                 JOIN mobilization_events e2 ON e2.id = es.event_id
                WHERE es.source_id = s.id LIMIT 1) status
         FROM sources s
        ORDER BY s.retrieved_at DESC
        LIMIT 100`,
    )
    .all() as Row[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Sources</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {Number(total).toLocaleString("fr-FR")} sources enregistrées ·{" "}
        {Number(accepted).toLocaleString("fr-FR")} événements validés ·{" "}
        {Number(pending).toLocaleString("fr-FR")} en attente de vérification
      </p>

      {total === 0 ? (
        <p className="mt-6 rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Aucune source collectée pour l&apos;instant. Le registre ne contient que des
          sources vérifiables : tant que la collecte n&apos;a pas tourné, le compte reste
          vide et la carte affiche « aucune information récente » partout. C&apos;est le
          comportement attendu, pas un bug.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-2">
            {byType.map((t) => (
              <li
                key={t.source_type}
                className="rounded bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700"
              >
                {TYPE_LABELS[t.source_type] ?? t.source_type} :{" "}
                {Number(t.n).toLocaleString("fr-FR")}
              </li>
            ))}
          </ul>

          <table className="mt-6 w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-1 font-medium">Source</th>
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium">Publié</th>
                <th className="py-1 font-medium">Collecté</th>
                <th className="py-1 text-right font-medium">Événements</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={String(s.id)} className="border-b border-neutral-100 align-top">
                  <td className="py-1 pr-2">
                    <a
                      href={String(s.url)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-neutral-900 underline underline-offset-2"
                    >
                      {s.title ? String(s.title) : String(s.url)}
                    </a>
                    {s.publisher ? (
                      <span className="block text-neutral-500">{String(s.publisher)}</span>
                    ) : null}
                  </td>
                  <td className="py-1">{TYPE_LABELS[String(s.source_type)] ?? String(s.source_type)}</td>
                  <td className="py-1 tabular-nums text-neutral-600">{fr(s.published_at)}</td>
                  <td className="py-1 tabular-nums text-neutral-600">{fr(s.retrieved_at)}</td>
                  <td className="py-1 text-right tabular-nums">{Number(s.nb_events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
