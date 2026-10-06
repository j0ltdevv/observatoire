/**
 * Chiffres externes publiés par d'autres acteurs (PRD §17).
 *
 * Règle : on ENREGISTRE le chiffre avec sa définition et son périmètre. On ne
 * le compare pas mécaniquement au nôtre : « 400 établissements fermés » et
 * « 500 lycées suspendus » ne mesurent pas la même chose.
 *
 * `figure_text` garde la formulation d'origine, approximatifs compris.
 */

import { all, getDb, nowIso } from "../lib/db/index.ts";

export interface ExternalCount {
  publisher: string;
  figure: number | null;
  figure_text: string;
  definition: string;
  scope: string;
  reference_date: string;
  source_url?: string | null;
}

export function addExternalCount(c: ExternalCount): void {
  getDb()
    .prepare(
      `INSERT INTO external_counts
         (publisher, figure, figure_text, definition, scope, reference_date, source_url, created_at)
       VALUES (@publisher, @figure, @figure_text, @definition, @scope, @reference_date, @source_url, @at)`,
    )
    .run({
      publisher: c.publisher,
      figure: c.figure,
      figure_text: c.figure_text,
      definition: c.definition,
      scope: c.scope,
      reference_date: c.reference_date,
      source_url: c.source_url ?? null,
      at: nowIso(),
    });
}

export interface ExternalCountRow {
  id: number;
  publisher: string;
  figure: number | null;
  figure_text: string;
  definition: string;
  scope: string;
  reference_date: string;
  source_url: string | null;
}

export function listExternalCounts(): ExternalCountRow[] {
  return all<ExternalCountRow>(
    getDb(),
    `SELECT * FROM external_counts ORDER BY reference_date DESC, publisher`,
  );
}

/** Notre propre décompte, dans la MÊME forme que les chiffres externes. */
export function ourOwnCount(): {
  publisher: string;
  figure_text: string;
  definition: string;
  scope: string;
  reference_date: string;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) n
         FROM school_current c
         JOIN schools s ON s.id = c.school_id
        WHERE s.scope = 'FR_METRO'
          AND c.status IS NOT NULL AND c.status <> 'AUCUNE_INFO'`,
    )
    .get() as { n: number };

  return {
    publisher: "Cet observatoire",
    figure_text: `${Number(row.n).toLocaleString("fr-FR")} établissements avec au moins un signalement documenté`,
    definition:
      "Établissements auxquels au moins un événement a été rattaché à un UAI " +
      "ET validé par un vérificateur. Hors DOM. Ne compte ni les élèves, ni les manifestations.",
    scope: "France métropolitaine, lycées et sections",
    reference_date: nowIso().slice(0, 10),
  };
}
