/**
 * Pages stats et méthodologie — obligatoires (PRD §20, §25).
 */

import Link from "next/link";
import { getStats, getStatsByDimension, getDistricts } from "@/lib/db/queries";
import { DEFAULT_SCOPE } from "@/lib/geo";
import { STATUS_COLORS, STATUS_LABELS, type DisplayStatus } from "@/types";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v ?? 0);
const fr = (v: unknown): string => n(v).toLocaleString("fr-FR");

export default async function StatisticsPage() {
  const stats = getStats({});
  const parRegion = getStatsByDimension("region");
  const parDept = getStatsByDimension("department");
  const { academies } = getDistricts();

  const detail: Array<[DisplayStatus, number]> = [
    ["CONFIRME", stats.confirmes],
    ["SIGNALE", stats.signales],
    ["FERME", stats.fermes],
    ["BLOQUE", stats.bloques],
    ["PERTURBE", stats.perturbes],
    ["CONTRADICTOIRE", stats.contradictoires],
    ["EXPIRE", stats.expires],
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Statistiques</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Tous les chiffres ci-dessous sont calculés directement depuis la base, à
        l&apos;instant de la consultation. Périmètre : France métropolitaine, lycées et
        sections d&apos;enseignement.
      </p>

      {/* Le chiffre principal est formulé comme le PRD l'exige (§16) */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Établissements avec au moins un signalement documenté
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums text-neutral-900">
          {fr(stats.with_signalement)}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          sur {fr(stats.total_schools)} établissements suivis. Ce nombre ne dit pas
          combien d&apos;élèves sont mobilisés : il compte les établissements pour
          lesquels une source publique a été trouvée et rattachée.
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {detail.map(([s, count]) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                style={{ background: STATUS_COLORS[s] }}
              />
              <span className="flex-1">{STATUS_LABELS[s]}</span>
              <span className="tabular-nums font-medium">{fr(count)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
          {fr(stats.aucune_info)} établissements n&apos;ont aucune information récente.
          Ce n&apos;est pas une absence de mobilisation : c&apos;est une absence de
          documentation, et le registre les distingue.
        </p>
      </section>

      <Section title="Par région" rows={parRegion} />
      <Section title="Par département" rows={parDept} limit={25} />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Académies couvertes</h2>
        <p className="text-xs text-neutral-600">
          {academies.length} académies en France métropolitaine.
        </p>
      </section>
    </main>
  );
}

function Section({ title, rows, limit }: { title: string; rows: Row[]; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(1, ...shown.map((r) => n(r.avec_info)));
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-1 font-medium">Territoire</th>
            <th className="py-1 text-right font-medium">Suivis</th>
            <th className="py-1 text-right font-medium">Avec info</th>
            <th className="py-1 text-right font-medium">Confirmés</th>
            <th className="py-1 text-right font-medium">Fermés</th>
            <th className="py-1 text-right font-medium">Contrad.</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={String(r.code)} className="border-b border-neutral-100">
              <td className="py-1">
                <Link
                  href={`/?${
                    title === "Par région" ? "region" : "department"
                  }=${r.code}`}
                  className="hover:underline"
                >
                  {String(r.name)}
                </Link>
                <span
                  aria-hidden
                  className="ml-2 inline-block h-1.5 rounded-full align-middle"
                  style={{
                    width: `${Math.round((n(r.avec_info) / max) * 80)}px`,
                    background: n(r.avec_info) > 0 ? "#f59e0b" : "#d4d4d4",
                  }}
                />
              </td>
              <td className="py-1 text-right tabular-nums">{fr(r.total)}</td>
              <td className="py-1 text-right tabular-nums">{fr(r.avec_info)}</td>
              <td className="py-1 text-right tabular-nums">{fr(r.confirmes)}</td>
              <td className="py-1 text-right tabular-nums">{fr(r.fermes)}</td>
              <td className="py-1 text-right tabular-nums">{fr(r.contradictoires)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && (
        <p className="mt-2 text-[11px] text-neutral-500">
          {limit} affichés sur {rows.length}. Utilisez les filtres de la carte pour
          le reste.
        </p>
      )}
    </section>
  );
}
