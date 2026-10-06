/**
 * Panneau d'exploration : recherche, filtres, légende, sélection.
 *
 * L'état des filtres vit dans l'URL (searchParams) : un journaliste doit
 * pouvoir envoyer un lien vers « lycées signalés en Gironde » et que la vue
 * soit reproductible. C'est aussi ce qui rend les statistiques auditables.
 */

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VueCarte from "@/components/map/VueCarte";
import type { MapPoint } from "@/components/map/CarteObservatoire";
import Legende from "@/components/map/Legende";
import { STATUS_LABELS, type DisplayStatus } from "@/types";
import type { GlobalStats } from "@/lib/db/queries";

interface District {
  code: string;
  name: string;
}

const WINDOWS = [
  { value: "", label: "Tout" },
  { value: "-6 hours", label: "6 h" },
  { value: "-24 hours", label: "24 h" },
  { value: "-7 days", label: "7 j" },
  { value: "-30 days", label: "30 j" },
];

export function Explorateur({
  districts,
  stats,
  points,
}: {
  districts: { regions: District[]; departments: District[]; academies: District[] };
  stats: GlobalStats;
  points: MapPoint[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(() => params.get("search") ?? "");
  const [selected, setSelected] = useState<string | null>(null);

  const activeStatuses = useMemo(
    () => (params.get("status")?.split(",").filter(Boolean) ?? []) as DisplayStatus[],
    [params],
  );

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.push(`/?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  // Anti-rebond : une requête SQL par frappe serait absurde.
  const urlSearch = params.get("search") ?? "";
  const pushedRef = useRef(urlSearch);
  useEffect(() => {
    if (search === pushedRef.current) return;
    const t = setTimeout(() => {
      pushedRef.current = search;
      push({ search: search || null });
    }, 350);
    return () => clearTimeout(t);
  }, [search, push]);

  const toggleStatus = (s: DisplayStatus) => {
    const next = activeStatuses.includes(s)
      ? activeStatuses.filter((x) => x !== s)
      : [...activeStatuses, s];
    push({ status: next.length ? next.join(",") : null });
  };

  const counts = useMemo(() => {
    const c: Partial<Record<DisplayStatus, number>> = {};
    for (const p of points) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [points]);

  const selectedPoint = useMemo(
    () => (selected ? points.find((p) => p.uai === selected) ?? null : null),
    [selected, points],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Filtres : en haut sur mobile, à gauche sur grand écran (PRD §24) */}
      <aside className="z-10 flex shrink-0 flex-col gap-3 overflow-y-auto border-b border-neutral-200 bg-white p-3 lg:w-72 lg:border-b-0 lg:border-r">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom, commune, département ou UAI…"
          aria-label="Rechercher un établissement"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />

        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Région"
            value={params.get("region") ?? ""}
            onChange={(v) => push({ region: v || null })}
            options={districts.regions}
          />
          <Select
            label="Département"
            value={params.get("department") ?? ""}
            onChange={(v) => push({ department: v || null })}
            options={districts.departments}
          />
        </div>

        <Select
          label="Académie"
          value={params.get("academy") ?? ""}
          onChange={(v) => push({ academy: v || null })}
          options={districts.academies}
        />

        <div>
          <span className="mb-1 block text-[11px] font-medium text-neutral-600">
            Dernière information
          </span>
          <div className="flex flex-wrap gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.value || "all"}
                type="button"
                onClick={() => push({ since: w.value || null })}
                className={`rounded px-2 py-1 text-[11px] ${
                  (params.get("since") ?? "") === w.value
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input
            type="checkbox"
            checked={params.get("all") !== "1"}
            onChange={(e) => push({ all: e.target.checked ? null : "1" })}
          />
          Lycées et sections uniquement
        </label>

        <Legende counts={counts} active={activeStatuses} onToggle={toggleStatus} />

        <dl className="border-t border-neutral-200 pt-2 text-[11px] text-neutral-600">
          <Row k="Établissements suivis" v={stats.total_schools} />
          <Row k="Avec information documentée" v={stats.with_signalement} />
          <Row k="Confirmés" v={stats.confirmes} />
          <Row k="Fermés" v={stats.fermes} />
          <Row k="Contradictoires" v={stats.contradictoires} />
          <Row k="Aucune information" v={stats.aucune_info} />
        </dl>
      </aside>

      <div className="relative min-h-[55vh] flex-1 lg:min-h-0">
        <VueCarte points={points} selectedUai={selected} onSelect={setSelected} />

        {selectedPoint && (
          <div className="absolute left-3 top-3 z-[500] w-72 rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {selectedPoint.name}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {selectedPoint.city} · UAI {selectedPoint.uai}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fermer"
                className="shrink-0 rounded px-1 text-neutral-400 hover:text-neutral-700"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-700">
              Statut :{" "}
              <span className="font-medium">{STATUS_LABELS[selectedPoint.status]}</span>
            </p>
            <Link
              href={`/schools/${selectedPoint.uai}`}
              className="mt-2 inline-block text-xs font-medium text-neutral-900 underline underline-offset-2"
            >
              Ouvrir la fiche →
            </Link>
          </div>
        )}

        <p className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded bg-white/90 px-2 py-1 text-[10px] text-neutral-600 shadow-sm">
          Les couleurs indiquent le statut documenté, pas une opinion politique.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{k}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{v.toLocaleString("fr-FR")}</dd>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: District[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-neutral-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
