/**
 * Périmètre géographique.
 *
 * Règle : la carte du MVP montre la **France métropolitaine** (métropole +
 * Corse). Les DOM et les collectivités d'outre-mer sont importés et marqués
 * `FR_OUTREMER`, pas supprimés — on ne fait pas disparaître des données
 * sans trace, c'est contraire au PRD §39.7.
 *
 * Les codes postaux 97x/98x sont la source de vérité : c'est le seul critère
 * dans le dataset qui ne dépende ni d'un box géographique ni d'une liste
 *.maintenue à la main.
 */

export type Scope = "FR_METRO" | "FR_OUTREMER";

/**
 * Préfixes codes postaux hors métropole. 975 = Saint-Pierre-et-Miquelon,
 * 984/986/987/988 = Saint-Barthélemy, Saint-Martin, Polynésie,
 * Nouvelle-Calédonie.
 */
const OUTREMER_PREFIXES = ["97", "98"] as const;

export function scopeOf(postalCode: string | null | undefined): Scope {
  if (!postalCode) return "FR_OUTREMER"; // pas de code postal = hors périmètre par défaut
  const cp = postalCode.replace(/\s/g, "").slice(0, 2);
  return (OUTREMER_PREFIXES as readonly string[]).includes(cp) ? "FR_OUTREMER" : "FR_METRO";
}

/** La carte nationale du MVP : métropole uniquement. */
export const DEFAULT_SCOPE: Scope = "FR_METRO";

export const SCOPE_LABELS: Record<Scope, string> = {
  FR_METRO: "France métropolitaine",
  FR_OUTREMER: "DOM et collectivités d'outre-mer",
};

/** Vue France métropolitaine : [sud, ouest, nord, est] pour l'ajustement Leaflet. */
export const FRANCE_METRO_BOUNDS: [[number, number], [number, number]] = [
  [41.3, -5.2], // sud-ouest : Pays basque
  [51.2, 9.6], // nord-est : Alsace / Bonn
];

export const FRANCE_BOUNDS: [[number, number], [number, number]] = [
  [41.0, -63.5],
  [51.2, 168.5],
];
