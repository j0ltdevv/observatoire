/**
 * Page d'accueil : la carte est le cœur (PRD §24).
 *
 * Le serveur fait les requêtes (SQLite, pas de client HTTP pour le MVP) et
 * envoie les points déjà filtrés. Le client ne reçoit que ce qu'il affiche.
 */

import Link from "next/link";
import { Suspense } from "react";
import VueCarte from "@/components/map/VueCarte";
import { Explorateur } from "@/components/Explorateur";
import { getMapPoints, getStats, getDistricts } from "@/lib/db/queries";
import { DEFAULT_SCOPE, SCOPE_LABELS } from "@/lib/geo";
import type { DisplayStatus } from "@/types";

// La base est mutable : jamais de cache statique sur cette page.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const filters = {
    scope: DEFAULT_SCOPE,
    region: one("region"),
    department: one("department"),
    academy: one("academy"),
    schoolType: one("type"),
    search: one("search"),
    since: one("since"),
    lyceesOnly: one("type") === undefined && one("all") !== "1",
    status: one("status")
      ? (one("status")!.split(",") as DisplayStatus[])
      : undefined,
  };

  // 20 000 points : au-delà, le clustering canvas sature et le payload pèse.
  // Le compteur affiché, lui, porte sur le total filtré, pas sur la limite.
  const points = getMapPoints(filters, 20000);
  const stats = getStats(filters);
  const districts = getDistricts();

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="z-20 border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Observatoire des mobilisations des lycéens
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                statut : {stats.with_signalement.toLocaleString("fr-FR")} signalements
              </span>
            </h1>
            <p className="text-[11px] text-neutral-500">
              {SCOPE_LABELS[DEFAULT_SCOPE]} · {stats.total_schools.toLocaleString("fr-FR")}{" "}
              établissements suivis · données Éducation nationale (UAI)
            </p>
          </div>
          <nav className="flex items-center gap-3 text-xs text-neutral-600">
            <Link href="/statistics" className="hover:text-neutral-900">
              Statistiques
            </Link>
            <Link href="/comparaison" className="hover:text-neutral-900">
              Comparaison
            </Link>
            <Link href="/methodologie" className="hover:text-neutral-900">
              Méthodologie
            </Link>
            <Link href="/sources" className="hover:text-neutral-900">
              Sources
            </Link>
            <Link href="/admin" className="hover:text-neutral-900">
              Validation
            </Link>
          </nav>
        </div>
      </header>

      <Suspense fallback={null}>
        <Explorateur
          districts={districts}
          stats={stats}
          points={points.map((p) => ({
            uai: String(p.uai),
            name: String(p.name),
            city: String(p.city),
            department_code: String(p.department_code),
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            status: p.status as DisplayStatus,
          }))}
        />
      </Suspense>
    </main>
  );
}
