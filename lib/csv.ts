/**
 * Échappement CSV pour un public francophone.
 *
 * Deux décisions dictées par des bugs réels :
 *  - séparateur `;` et BOM UTF-8, sinon Excel en locale française ouvre le
 *    fichier dans une seule colonne ;
 *  - les retours à la ligne sont REMPLACÉS par une espace. Un champ multi-lignes
 *    est légal en CSV (RFC 4180) mais certains tableurs et outils d'import
 *    cassent dessus. Un export destiné à des journalistes ne vaut pas ce risque.
 */

export const CSV_BOM = "﻿";

export const csvEscape = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  const flat = s.replace(/[\r\n\t]+/g, " ");
  return /[";]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
};

/** Construit un CSV à partir de colonnes figées et de lignes objets. */
export function toCsv(
  columns: readonly string[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [columns.join(";")];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(r[c])).join(";"));
  return `${CSV_BOM}${lines.join("\n")}\n`;
}
