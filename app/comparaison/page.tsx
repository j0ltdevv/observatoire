/**
 * Comparaison des décomptes (PRD §17).
 *
 * Cette page affiche des chiffres qui ne se comparent PAS mécaniquement.
 * Elle met en regard, pour chacun, sa définition, son périmètre et sa date —
 * parce que « 400 établissements fermés » et « 500 lycées suspendus » ne
 * mesurent pas la même chose.
 */

import Link from "next/link";
import { listExternalCounts, ourOwnCount, type ExternalCountRow } from "@/lib/external-counts";

export const dynamic = "force-dynamic";

const fr = (v: string | null): string => (v ? v.slice(0, 10) : "date inconnue");

/**
 * Évolution par date : c'est la seule lecture qui veut dire quelque chose.
 * Un total isolé ne dit pas s'il remplace un plus grand ou un plus petit.
 */
function SectionEvolution({ counts }: { counts: ExternalCountRow[] }) {
  const dates = [...new Set(counts.map((c) => c.reference_date))].sort();
  const valeurs = counts
    .map((c) => c.figure)
    .filter((v): v is number => v !== null && v > 0);
  const max = Math.max(1, ...valeurs);

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-neutral-900">Évolution par jour</h2>
      <p className="mt-1 text-xs text-neutral-600">
        Plusieurs décomptes pour une même date : ils ne se cumulent pas, ils se
        contestent. Deux méthodes le même jour donnent deux chiffres, et c&apos;est
        l&apos;information.
      </p>
      <ul className="mt-3 space-y-2">
        {dates.map((d) => {
          const du = counts.filter((c) => c.reference_date === d);
          return (
            <li key={d}>
              <p className="text-xs font-medium tabular-nums text-neutral-700">{fr(d)}</p>
              <ul className="mt-0.5 space-y-0.5">
                {du.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 text-neutral-500">
                      {c.publisher.length > 20 ? `${c.publisher.slice(0, 19)}…` : c.publisher}
                    </span>
                    <span
                      aria-hidden
                      className="h-2 shrink-0 rounded-full bg-neutral-400"
                      style={{ width: `${c.figure ? Math.max(3, Math.round((c.figure / max) * 130)) : 3}px` }}
                    />
                    <span className="tabular-nums text-neutral-800">
                      {c.figure ?? "—"}
                    </span>
                    <span className="truncate text-neutral-500">{c.figure_text}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ComparaisonPage() {
  const counts = listExternalCounts();
  const nous = ourOwnCount();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">
        Comparer les comptages
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700">
        Plusieurs chiffres circulent en même temps. Ils ne sont pas
        nécessairement contradictoires : ils ne comptent pas la même chose.
        Les définitions et les périmètres diffèrent. Ce registre n&apos;a pas
        le droit de désigner un « vrai chiffre » — il affiche ce que chaque
        acteur a compté, et sur quelle base.
      </p>

      <SectionEvolution counts={counts} />

      <section className="mt-6 rounded-lg border-2 border-neutral-900 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Cet observatoire
        </p>
        <p className="mt-1 text-lg font-semibold">{nous.figure_text}</p>
        <dl className="mt-2 grid gap-1 text-xs text-neutral-600 sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">Définition : </dt>
            <dd className="inline">{nous.definition}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Périmètre : </dt>
            <dd className="inline">{nous.scope}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Date : </dt>
            <dd className="inline">{fr(nous.reference_date)}</dd>
          </div>
        </dl>
      </section>

      {counts.length === 0 ? (
        <p className="mt-6 rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Aucun décompte externe enregistré. Lancez{" "}
          <code className="font-mono text-xs">node scripts/import-external-counts.ts</code>.
        </p>
      ) : (
        <table className="mt-6 w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="py-2 pr-3 font-medium">Acteur</th>
              <th className="py-2 pr-3 font-medium">Chiffre publié</th>
              <th className="py-2 pr-3 font-medium">Ce qui est compté</th>
              <th className="py-2 pr-3 font-medium">Périmètre</th>
              <th className="py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 align-top">
                <td className="py-2 pr-3 font-medium text-neutral-900">
                  {c.publisher}
                </td>
                <td className="py-2 pr-3">{c.figure_text}</td>
                <td className="py-2 pr-3 text-neutral-600">{c.definition}</td>
                <td className="py-2 pr-3 text-neutral-600">{c.scope}</td>
                <td className="py-2 tabular-nums text-neutral-600">{fr(c.reference_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
        <p className="font-semibold">Pourquoi aucune moyenne n&apos;est calculée ici.</p>
        <p className="mt-1">
          Une moyenne de chiffres qui ne comptent pas la même chose n&apos;est pas un
          chiffre : c&apos;est une fausse précision. Les définitions ci-dessus ne sont
          pas interchangeables — l&apos;une compte des fermetures, l&apos;autre des
          suspensions totales ou partielles, une autre des interdictions de
          rassemblement. Additionner ou moyenner reviendrait à fabriquer un nombre
          que personne n&apos;a publié.
        </p>
      </section>
    </main>
  );
}
