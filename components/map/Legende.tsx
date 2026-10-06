"use client";

import { useMemo } from "react";
import { STATUS_COLORS, STATUS_LABELS, type DisplayStatus } from "@/types";

const ORDER: DisplayStatus[] = [
  "CONFIRME",
  "SIGNALE",
  "FERME",
  "BLOQUE",
  "PERTURBE",
  "CONTRADICTOIRE",
  "EXPIRE",
  "AUCUNE_INFO",
];

/**
 * Légende permanente (PRD §18). Les couleurs représentent le statut, jamais
 * une opinion. AUCUNE_INFO est listée en dernier et explicitement notée :
 * « aucune information » ≠ « aucune mobilisation » (§4.5).
 */
export default function Legende({
  counts,
  active,
  onToggle,
}: {
  counts: Partial<Record<DisplayStatus, number>>;
  active: DisplayStatus[];
  onToggle: (status: DisplayStatus) => void;
}) {
  const total = useMemo(
    () => ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0),
    [counts],
  );

  return (
    <div className="pointer-events-auto w-56 rounded-lg border border-neutral-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="border-b border-neutral-200 px-3 py-2">
        <p className="text-xs font-semibold text-neutral-900">
          {total.toLocaleString("fr-FR")} établissements affichés
        </p>
        <p className="text-[11px] text-neutral-500">France métropolitaine</p>
      </div>
      <ul className="max-h-[46vh] overflow-y-auto py-1">
        {ORDER.map((s) => {
          const on = active.includes(s);
          const n = counts[s] ?? 0;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onToggle(s)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-neutral-100 ${
                  on ? "bg-neutral-100 font-medium" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ background: STATUS_COLORS[s] }}
                />
                <span className="flex-1 truncate text-neutral-800">{STATUS_LABELS[s]}</span>
                <span className="tabular-nums text-neutral-500">
                  {n.toLocaleString("fr-FR")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-neutral-200 px-3 py-2 text-[10px] leading-tight text-neutral-500">
        « Aucune information récente » signifie qu&apos;aucune source publique n&apos;a été
        trouvée. Ce n&apos;est pas une absence de mobilisation.
      </p>
    </div>
  );
}
