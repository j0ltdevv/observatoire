/**
 * Carte nationale — CŒUR de l'interface (PRD §18).
 *
 * Décisions :
 * - Leaflet en `dynamic(..., { ssr: false })` : Leaflet touche `window` au
 *   chargement, un rendu serveur plante. react-leaflet v5 n'a pas de garde.
 * - Clustering par CANVAS, pas 60 000 nœuds DOM (PRD §32). On dessine des
 *   cercles dans un seul `<canvas>` : 60 000 marqueurs DOM tuent le mobile.
 * - Couleurs = statut, jamais opinion politique.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { FRANCE_METRO_BOUNDS } from "@/lib/geo";
import { STATUS_COLORS, type DisplayStatus } from "@/types";

export interface MapPoint {
  uai: string;
  name: string;
  city: string;
  department_code: string;
  latitude: number;
  longitude: number;
  status: DisplayStatus;
}

interface Props {
  points: MapPoint[];
  selectedUai: string | null;
  onSelect: (uai: string) => void;
  /** Hauteur du conteneur. */
  className?: string;
}

/** Rayon d'un point seul, en pixels. */
const R_POINT = 4;
/** Au-delà de ce nombre de points dans une maille, on regroupe. */
const CLUSTER_THRESHOLD = 6;
/** Taille de maille en pixels de carte. */
const GRID_PX = 56;

interface Cell {
  x: number;
  y: number;
  points: MapPoint[];
}

interface Drawn {
  /** Cercle simple. */
  x: number;
  y: number;
  r: number;
  fill: string;
  stroke: string;
  uai: string | null;
  /** pastille de regroupement. */
  cluster: boolean;
  count: number;
  statuses: DisplayStatus[];
}

/**
 * Regroupe les points par maille écran. Une maille qui contient des statuts
 * différents prend la couleur la plus "forte" — c'est une convention
 * d'affichage, pas un statut de l'établissement.
 */
const PRIORITY: DisplayStatus[] = [
  "CONTRADICTOIRE",
  "CONFIRME",
  "FERME",
  "BLOQUE",
  "PERTURBE",
  "SIGNALE",
  "EXPIRE",
  "AUCUNE_INFO",
];

function dominantStatus(statuses: DisplayStatus[]): DisplayStatus {
  for (const s of PRIORITY) if (statuses.includes(s)) return s;
  return "AUCUNE_INFO";
}

/** Dessine sur un canvas superposé à la carte Leaflet. */
function CanvasLayer({
  points,
  map,
  selectedUai,
  onSelect,
}: {
  points: MapPoint[];
  map: LeafletMap;
  selectedUai: string | null;
  onSelect: (uai: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef<Drawn[]>([]);
  const hitRef = useRef<Drawn[]>([]);
  const hoverRef = useRef<number>(-1);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    // Grille écran : une maille = GRID_PX pixels, indépendante du zoom.
    const grid = new Map<string, MapPoint[]>();
    for (const p of points) {
      const pt = map.latLngToContainerPoint([p.latitude, p.longitude]);
      if (pt.x < -GRID_PX || pt.y < -GRID_PX || pt.x > size.x + GRID_PX || pt.y > size.y + GRID_PX) {
        continue; // hors champ : ne pas payer le rendu
      }
      const key = `${Math.floor(pt.x / GRID_PX)}:${Math.floor(pt.y / GRID_PX)}`;
      const list = grid.get(key);
      if (list) list.push(p);
      else grid.set(key, [p]);
    }

    const drawn: Drawn[] = [];

    for (const [, cell] of grid) {
      if (cell.length > CLUSTER_THRESHOLD) {
        let sx = 0;
        let sy = 0;
        for (const p of cell) {
          const pt = map.latLngToContainerPoint([p.latitude, p.longitude]);
          sx += pt.x;
          sy += pt.y;
        }
        const x = sx / cell.length;
        const y = sy / cell.length;
        const statuses = [...new Set(cell.map((p) => p.status))];
        const fill = STATUS_COLORS[dominantStatus(statuses)];
        const r = Math.min(26, 11 + Math.log2(cell.length) * 2.6);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `${fill}33`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = fill;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cell.length), x, y);

        drawn.push({ x, y, r, fill, stroke: fill, uai: null, cluster: true, count: cell.length, statuses });
      } else {
        for (const p of cell) {
          const pt = map.latLngToContainerPoint([p.latitude, p.longitude]);
          const fill = STATUS_COLORS[p.status];
          const isSel = p.uai === selectedUai;

          if (isSel) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, R_POINT + 5, 0, Math.PI * 2);
            ctx.fillStyle = `${fill}40`;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSel ? R_POINT + 2 : R_POINT, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.lineWidth = isSel ? 2.5 : 1;
          ctx.strokeStyle = isSel ? "#111" : "#fff";
          ctx.stroke();

          drawn.push({
            x: pt.x, y: pt.y, r: R_POINT + 2, fill, stroke: "#fff",
            uai: p.uai, cluster: false, count: 1, statuses: [p.status],
          });
        }
      }
    }

    drawnRef.current = drawn;
    hitRef.current = drawn;
  }, [points, map, selectedUai]);

  useEffect(() => {
    redraw();
    map.on("move zoom resize", redraw);
    return () => {
      map.off("move zoom resize", redraw);
    };
  }, [map, redraw]);

  const hitTest = useCallback(
    (mx: number, my: number): number => {
      const items = hitRef.current;
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const d = items[i];
        if ((d.x - mx) ** 2 + (d.y - my) ** 2 <= d.r ** 2) return i;
      }
      return -1;
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const idx = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      canvas.style.cursor = idx >= 0 ? "pointer" : "grab";
      hoverRef.current = idx;
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const idx = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (idx < 0) return;
      const d = hitRef.current[idx];
      // Un cluster n'est pas un établissement : on ne navigue pas dessus.
      if (d.uai) onSelect(d.uai);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [hitTest, onSelect]);

  return <canvas ref={canvasRef} className="absolute inset-0 z-[400]" />;
}

/** Recentre la carte sur l'établissement sélectionné. */
function FlyTo({ uai, points }: { uai: string | null; points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!uai) return;
    const p = points.find((x) => x.uai === uai);
    if (p) map.flyTo([p.latitude, p.longitude], Math.max(map.getZoom(), 11), { duration: 0.6 });
  }, [uai, points, map]);
  return null;
}

function BoundsFitter({ count }: { count: number }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || count === 0) return;
    map.fitBounds(FRANCE_METRO_BOUNDS, { padding: [20, 20] });
    fitted.current = true;
  }, [map, count]);
  return null;
}

/**
 * Le canvas doit vivre DANS le MapContainer pour partager le contexte Leaflet :
 * c'est `useMap()` qui fournit l'instance, pas un état local.
 */
function Scattered({
  points,
  selectedUai,
  onSelect,
}: {
  points: MapPoint[];
  selectedUai: string | null;
  onSelect: (uai: string) => void;
}) {
  const map = useMap();
  return (
    <CanvasLayer points={points} map={map} selectedUai={selectedUai} onSelect={onSelect} />
  );
}

export default function CarteObservatoire({ points, selectedUai, onSelect, className }: Props) {
  const center = useMemo<[number, number]>(() => [46.6, 2.4], []);

  return (
    <div className={`relative overflow-hidden ${className ?? "h-full w-full"}`}>
      <MapContainer
        center={center}
        zoom={6}
        minZoom={5}
        maxZoom={17}
        bounds={FRANCE_METRO_BOUNDS}
        boundsOptions={{ padding: [20, 20] }}
        className="h-full w-full"
        zoomControl={false}
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ZoomButtons />
        <BoundsFitter count={points.length} />
        <FlyTo uai={selectedUai} points={points} />
        <Scattered points={points} selectedUai={selectedUai} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}

function ZoomButtons() {
  const map = useMap();
  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1">
      <button
        type="button"
        aria-label="Zoomer"
        onClick={() => map.zoomIn()}
        className="h-9 w-9 rounded-md border border-neutral-300 bg-white/95 text-lg font-bold leading-none shadow-sm hover:bg-white"
      >
        +
      </button>
      <button
        type="button"
        aria-label="Dézoomer"
        onClick={() => map.zoomOut()}
        className="h-9 w-9 rounded-md border border-neutral-300 bg-white/95 text-lg font-bold leading-none shadow-sm hover:bg-white"
      >
        −
      </button>
    </div>
  );
}
