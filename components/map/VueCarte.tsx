/**
 * Enveloppe cliente de la carte : Leaflet touche `window` au chargement, donc
 * le composant n'est rendu qu'après le mount. Le serveur renvoie le squelette.
 */

"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "./CarteObservatoire";

const CarteObservatoire = dynamic(() => import("./CarteObservatoire"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
      Chargement de la carte…
    </div>
  ),
});

export default function VueCarte({
  points,
  selectedUai,
  onSelect,
}: {
  points: MapPoint[];
  selectedUai: string | null;
  onSelect: (uai: string) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Aucun établissement ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <CarteObservatoire
      points={points}
      selectedUai={selectedUai}
      onSelect={onSelect}
      className="h-full w-full"
    />
  );
}
