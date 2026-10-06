/**
 * Validation par lot, avec une justification unique (PRD §30).
 *
 *   node scripts/accept-batch.ts "<justification>" "<vérificateur>"
 *
 * Utile quand une SOURCE UNIQUE fait autorité pour un lot — par exemple la
 * préfecture de police qui recense nominativement des lycées fermés. Le lot
 * reste alors en confiance C : une source, pas deux. La promotion en A exige
 * une seconde source indépendante, vérifiée événement par événement.
 */

import { get, getDb, nowIso } from "../lib/db/index.ts";
import type { Params } from "../lib/db/index.ts";
import { recomputeAllStatuses } from "../lib/db/status.ts";

const raison = process.argv[2]?.trim();
const verificateur = process.argv[3]?.trim() ?? "anonyme";

if (!raison) {
  console.error(
    'usage : node scripts/accept-batch.ts "<justification>" "<vérificateur>"\n' +
      "Sans justification, rien n'est accepté : une validation sans motif ne vaut rien.",
  );
  process.exit(1);
}

const db = getDb();
const pending = db
  .prepare(
    `SELECT e.id, e.school_id, e.status, e.confidence_level,
              (SELECT es.source_id FROM event_sources es WHERE es.event_id = e.id LIMIT 1) AS source_id,
              s.uai, s.name
         FROM mobilization_events e
         JOIN schools s ON s.id = e.school_id
        WHERE e.review_state = 'pending'
        ORDER BY s.name`,
  )
  .all() as Array<{
  id: number;
  school_id: number;
  status: string;
  confidence_level: string;
  source_id: number | null;
  uai: string;
  name: string;
}>;

if (pending.length === 0) {
  console.log("Aucun signalement en attente.");
  process.exit(0);
}

console.log(`${pending.length} signalement(s) à valider.\n`);

const db2 = db;
db2.exec("BEGIN");
try {
  for (const e of pending) {
    // La confiance ne monte jamais par lot : elle plafonne à C.
    const level = e.confidence_level === "D" ? "C" : e.confidence_level;

    db2
      .prepare(
        `UPDATE mobilization_events
            SET review_state = 'accepted', confidence_level = @level, confidence_reason = @raison
          WHERE id = @id`,
      )
      .run({ id: e.id, level, raison });

    const before = get<{ status: string }>(
      db2,
      "SELECT status FROM school_current WHERE school_id = @id",
      { id: e.school_id } as Params,
    );

    db2.exec("COMMIT");
    recomputeAllStatuses();
    db2.exec("BEGIN");

    const after = get<{ status: string }>(
      db2,
      "SELECT status FROM school_current WHERE school_id = @id",
      { id: e.school_id } as Params,
    );

    if (after && before?.status !== after.status) {
      db2
        .prepare(
          `INSERT INTO status_history (school_id, old_status, new_status, changed_at, reason, source_id)
           VALUES (@school, @old, @new, @at, @raison, @source)`,
        )
        .run({
          school: e.school_id,
          old: before?.status ?? null,
          new: after.status,
          at: nowIso(),
          raison: `${verificateur} : ${raison}`,
          source: e.source_id,
        });
    }

    console.log(`  ✓ ${e.uai}  ${e.status.padEnd(8)} → ${after?.status ?? "?"}  ${e.name.slice(0, 44)}`);
  }
  db2.exec("COMMIT");
} catch (err) {
  db2.exec("ROLLBACK");
  throw err;
}

console.log("\nRappel : ces événements restent en confiance C.");
console.log("Une seule source ne peut pas produire un CONFIRME (niveau A).");
