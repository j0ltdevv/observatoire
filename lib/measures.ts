/**
 * Mesures institutionnelles : arrêtés préfectoraux, décisions de fermeture.
 *
 * POINT MÉTHODOLOGIQUE CENTRAL. Un arrêté qui interdit les rassemblements
 * devant un lycée n'est PAS une fermeture de ce lycée. En déduire `FERME`
 * serait l'interprétation interdite par le PRD §4.4 : on ajouterait un fait
 * que la source n'a pas écrit. Les mesures sont donc stockées à part, avec les
 * établissements qu'elles nomment, et croisées avec le registre sans jamais
 * produire un statut.
 */

import { all, get, getDb } from "./db/index.ts";
import { matchSchool } from "./matching.ts";
import type { Params } from "./db/index.ts";

export type MeasureType = "INTERDICTION_RASSEMBLEMENT" | "FERMETURE";

export const MEASURE_LABELS: Record<MeasureType, string> = {
  INTERDICTION_RASSEMBLEMENT: "Interdiction de rassemblement",
  FERMETURE: "Fermeture",
};

export interface Measure {
  id: number;
  authority: string;
  measure_type: MeasureType;
  scope: string;
  reference_date: string;
  announced_count: number | null;
  source_id: number;
  url: string | null;
}

export function insertMeasure(m: Omit<Measure, "id" | "url">): number {
  const info = getDb()
    .prepare(
      `INSERT INTO institutional_measures
         (source_id, authority, measure_type, scope, reference_date, announced_count)
       VALUES (@source_id, @authority, @measure_type, @scope, @reference_date, @announced_count)`,
    )
    .run({
      source_id: m.source_id,
      authority: m.authority,
      measure_type: m.measure_type,
      scope: m.scope,
      reference_date: m.reference_date,
      announced_count: m.announced_count,
    });
  return Number(info.lastInsertRowid);
}

/**
 * Rattachement d'un établissement nommé par un acte à son UAI.
 *
 * La résolution vit ICI, pas dans le script appelant : une fonction qui stocke
 * un établissement nommé est responsable de le rattacher. La laisser à
 * l'appelant a produit un bug réel — des entrées sans `school_id`, donc
 * invisibles au croisement.
 */
function resolveEntry(e: {
  raw_name: string;
  /** Nom nettoyé pour le rattachement. Par défaut `raw_name`. */
  name?: string;
  city?: string | null;
  arrondissement?: string | null;
  school_id?: number | null;
}): { school_id: number | null; match_reason: string | null } {
  if (e.school_id) return { school_id: e.school_id, match_reason: "UAI imposé" };

  const db = getDb();
  // Un arrêté ne parle que de lycées : on ne rattache jamais à une école.
  const m = matchSchool({
    name: e.name ?? e.raw_name,
    city: e.city ?? undefined,
    etab_kind: "lycee",
  });
  if (!m.uai) return { school_id: null, match_reason: m.reason };

  const row = db.prepare("SELECT id FROM schools WHERE uai = @uai").get({ uai: m.uai }) as
    | { id: number }
    | undefined;
  return {
    school_id: row?.id ?? null,
    match_reason: m.kind === "exact_uai" ? "UAI cité" : m.reason,
  };
}

export function insertEntries(
  measureId: number,
  entries: Array<{
    raw_name: string;
    /** Nom nettoyé pour le rattachement, distinct du nom affiché. */
    name?: string;
    city?: string | null;
    arrondissement?: string | null;
    school_id?: number | null;
    match_reason?: string | null;
  }>,
): { inserees: number; rattachees: number } {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO measure_entries (measure_id, raw_name, city, arrondissement, school_id, match_reason)
     VALUES (@measure_id, @raw_name, @city, @arrondissement, @school_id, @match_reason)`,
  );
  let rattachees = 0;
  db.exec("BEGIN");
  try {
    for (const e of entries) {
      const r = e.school_id || e.match_reason
        ? { school_id: e.school_id ?? null, match_reason: e.match_reason ?? null }
        : resolveEntry(e);
      if (r.school_id) rattachees += 1;
      stmt.run({
        measure_id: measureId,
        raw_name: e.raw_name,
        city: e.city ?? null,
        arrondissement: e.arrondissement ?? null,
        school_id: r.school_id,
        match_reason: r.match_reason,
      });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { inserees: entries.length, rattachees };
}

/**
 * Croisement mesure ↔ registre. Répond à LA question d'un journaliste :
 * « vous dites 26 établissements documentés, la préfecture en nomme 105 —
 *   que se passe-t-il pour les 79 autres ? »
 *
 * Réponse : rien. Aucune information. Ce n'est pas une absence de fermeture.
 */
export interface MeasureCrossCheck {
  measure: Measure;
  entries_total: number;
  entries_matched: number;
  entries_with_event: number;
  entries_without_event: number;
  /** Les établissements nommés par l'acte mais sans aucun événement au registre. */
  sans_info: Array<{ uai: string; name: string; city: string }>;
}

export function crossCheck(measureId: number): MeasureCrossCheck {
  const db = getDb();
  const m = get<Measure>(
    db,
    `SELECT im.id, im.authority, im.measure_type, im.scope, im.reference_date,
            im.announced_count, im.source_id, s.url
       FROM institutional_measures im
       JOIN sources s ON s.id = im.source_id
      WHERE im.id = @id`,
    { id: measureId } as Params,
  );
  if (!m) throw new Error(`mesure ${measureId} introuvable`);

  const rows = all<{
    school_id: number | null;
    uai: string | null;
    name: string | null;
    city: string | null;
    a_statut: string | null;
    raw_name: string;
  }>(
    db,
    `SELECT me.school_id, s.uai, s.name, s.city, c.status AS a_statut, me.raw_name
       FROM measure_entries me
       LEFT JOIN schools s ON s.id = me.school_id
       LEFT JOIN school_current c ON c.school_id = me.school_id
      WHERE me.measure_id = @id`,
    { id: measureId } as Params,
  );

  const matched = rows.filter((r) => r.school_id !== null);
  const withEvent = matched.filter((r) => r.a_statut && r.a_statut !== "AUCUNE_INFO");

  return {
    measure: m,
    entries_total: rows.length,
    entries_matched: matched.length,
    entries_with_event: withEvent.length,
    entries_without_event: matched.length - withEvent.length,
    sans_info: matched
      .filter((r) => !r.a_statut || r.a_statut === "AUCUNE_INFO")
      .map((r) => ({ uai: String(r.uai), name: String(r.name), city: String(r.city) })),
  };
}

export function listMeasures(): Measure[] {
  return all<Measure>(
    getDb(),
    `SELECT im.id, im.authority, im.measure_type, im.scope, im.reference_date,
            im.announced_count, im.source_id, s.url
       FROM institutional_measures im
       JOIN sources s ON s.id = im.source_id
      ORDER BY im.reference_date DESC`,
  );
}
