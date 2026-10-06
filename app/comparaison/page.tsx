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
import { crossCheck, listMeasures, MEASURE_LABELS } from "@/lib/measures";

export const dynamic = "force-dynamic";

const fr = (v: string | null): string => (v ? v.slice(0, 10) : "date inconnue");

/**
 * Croisement entre un acte institutionnel et le registre.
 *
 * C'est la section la plus importante de la page. Elle dit, noir sur blanc :
 * « la préfecture nomme 105 établissements, notre registre en documente 8 ».
 * Les 97 autres ne sont pas « sans mobilisation », ils sont sans information.
 */
function SectionMesures() {
  const mesures = listMeasures();
  if (mesures.length === 0) return null;

  return (
    <>
      {mesures.map((m) => {
        const x = crossCheck(m.id);
        return (
          <section key={m.id} className="mt-8 rounded-lg border border-neutral-300 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              {MEASURE_LABELS[m.measure_type]} — {fr(m.reference_date)}
            </h2>
            <p className="mt-1 text-xs text-neutral-600">
              {m.authority} · {m.scope}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cell k="Annoncé par la source" v={m.announced_count} />
              <Cell k="Nommés dans la liste" v={x.entries_total} />
              <Cell k="Rattachés à un UAI" v={x.entries_matched} />
              <Cell k="Documentés au registre" v={x.entries_with_event} strong />
            </dl>

            <p className="mt-3 rounded bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <strong>Un arrêté d&apos;interdiction de rassemblement n&apos;est pas une
              fermeture.</strong> Aucun statut n&apos;a été déduit de cet acte : le
              deriving « fermé » depuis « rassemblement interdit » serait inventer un
              fait que la source n&apos;a pas écrit (PRD §4.4). L&apos;acte est
              enregistré comme <em>mesure</em>, à part.
            </p>

            {x.entries_without_event > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-neutral-700">
                <strong>{x.entries_without_event}</strong> établissements nommés par
                l&apos;acté n&apos;ont <em>aucune information</em> dans le registre.
                Cela ne signifie pas qu&apos;ils n&apos;étaient pas concernés : cela
                signifie qu&apos;aucune source n&apos;a été trouvée pour eux, ou
                qu&apos;aucune n&apos;a pu être rattachée à leur UAI de façon
                vérifiable.
              </p>
            )}

            {x.sans_info.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-neutral-800">
                  Voir les {x.sans_info.length} établissements sans information
                </summary>
                <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] text-neutral-600 sm:grid-cols-2">
                  {x.sans_info.slice(0, 60).map((s) => (
                    <li key={s.uai}>
                      <Link
                        href={`/schools/${s.uai}`}
                        className="font-mono hover:underline"
                      >
                        {s.uai}
                      </Link>{" "}
                      — {s.name}, {s.city}
                    </li>
                  ))}
                </ul>
                {x.sans_info.length > 60 && (
                  <p className="mt-2 text-[11px] text-neutral-500">
                    60 affichés sur {x.sans_info.length}. Le CSV complet est exportable.
                  </p>
                )}
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}

function Cell({
  k,
  v,
  strong,
}: {
  k: string;
  v: number | null;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400">{k}</dt>
      <dd
        className={`text-lg tabular-nums ${strong ? "font-semibold text-neutral-900" : "text-neutral-700"}`}
      >
        {v === null ? "—" : v.toLocaleString("fr-FR")}
      </dd>
    </div>
  );
}

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

      <SectionMesures />

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
