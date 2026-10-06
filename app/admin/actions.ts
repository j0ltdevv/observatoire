"use server";

import { revalidatePath } from "next/cache";
import { get, getDb, nowIso } from "@/lib/db/index";
import { recomputeAllStatuses } from "@/lib/db/status";
import type { Params } from "@/lib/db/index";

/**
 * Actions de validation (PRD §30, §31).
 *
 * Trois invariants :
 *   - rien n'est publié sans action humaine explicite ;
 *   - `review_state` est obligatoire sur toute action ;
 *   - l'historique ne s'écrase jamais : on ajoute une ligne.
 */

export async function acceptEvent(formData: FormData) {
  const id = Number(formData.get("event_id"));
  const reviewer = String(formData.get("reviewer") ?? "anonyme").slice(0, 80);
  const reason = String(formData.get("reason") ?? "").slice(0, 600) ||
    "Validé manuellement par un vérificateur.";

  const db = getDb();
  const ev = get<{
    id: number;
    school_id: number;
    status: string;
    event_date: string;
    source_id: number | null;
    confidence_level: string;
  }>(
    db,
    `SELECT e.id, e.school_id, e.status, e.event_date, e.source_id, e.confidence_level
       FROM mobilization_events e WHERE e.id = @id`,
    { id } as Params,
  );
  if (!ev) return;

  db.prepare(
    `UPDATE mobilization_events
        SET review_state = 'accepted',
            confidence_reason = @reason,
            confidence_level = @level
      WHERE id = @id`,
  ).run({
    id,
    reason,
    level: ev.confidence_level === "D" ? "C" : ev.confidence_level,
  });

  const before = get<{ status: string }>(
    db,
    "SELECT status FROM school_current WHERE school_id = @id",
    { id: ev.school_id } as Params,
  );
  recomputeAllStatuses();
  const after = get<{ status: string }>(
    db,
    "SELECT status FROM school_current WHERE school_id = @id",
    { id: ev.school_id } as Params,
  );

  if (after && before?.status !== after.status) {
    db.prepare(
      `INSERT INTO status_history (school_id, old_status, new_status, changed_at, reason, source_id)
       VALUES (@school, @old, @new, @at, @reason, @source)`,
    ).run({
      school: ev.school_id,
      old: before?.status ?? null,
      new: after.status,
      at: nowIso(),
      reason: `${reviewer} : ${reason}`,
      source: ev.source_id,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function rejectEvent(formData: FormData) {
  const id = Number(formData.get("event_id"));
  const reviewer = String(formData.get("reviewer") ?? "anonyme").slice(0, 80);
  const reason = String(formData.get("reason") ?? "").slice(0, 600) ||
    "Rejeté manuellement.";

  getDb()
    .prepare(
      `UPDATE mobilization_events SET review_state = 'rejected', confidence_reason = @reason
        WHERE id = @id`,
    )
    .run({ id, reason: `${reviewer} : ${reason}` });

  recomputeAllStatuses();
  revalidatePath("/admin");
  revalidatePath("/");
}

/** Rattachement manuel d'un signalement non résolu vers un UAI (PRD §31). */
export async function resolveUnmatched(formData: FormData) {
  const reportId = Number(formData.get("report_id"));
  const uai = String(formData.get("uai") ?? "").trim().toUpperCase();
  const reviewer = String(formData.get("reviewer") ?? "anonyme").slice(0, 80);

  const db = getDb();
  const report = get<{
    id: number;
    source_id: number;
    quoted_name: string | null;
    proposed_status: string | null;
    extract: string;
  }>(
    db,
    `SELECT id, source_id, quoted_name, proposed_status, extract
       FROM unmatched_reports WHERE id = @id`,
    { id: reportId } as Params,
  );
  if (!report) return;

  const school = get<{ id: number; uai: string }>(
    db,
    "SELECT id, uai FROM schools WHERE uai = @uai",
    { uai } as Params,
  );

  transaction(() => {
    if (school) {
      const info = db
        .prepare(
          `INSERT INTO mobilization_events
             (school_id, status, description, confidence_level, confidence_reason,
              detected_at, event_date, review_state, created_by)
           VALUES (@school, @status, @description, 'C', @reason,
                   @detected_at, @event_date, 'accepted', @reviewer)`,
        )
        .run({
          school: school.id,
          status: report.proposed_status ?? "SIGNALE",
          description: report.extract,
          reason: `Rattachement manuel par ${reviewer} vers l'UAI ${uai}.`,
          detected_at: nowIso(),
          event_date: nowIso(),
          reviewer,
        });
      db.prepare("INSERT INTO event_sources (event_id, source_id) VALUES (?, ?)").run(
        Number(info.lastInsertRowid),
        report.source_id,
      );
    }
    db.prepare(
      `UPDATE unmatched_reports
          SET review_state = 'resolved', resolved_school_id = @school
        WHERE id = @id`,
    ).run({ id: reportId, school: school?.id ?? null });
  });

  recomputeAllStatuses();
  revalidatePath("/admin");
  revalidatePath("/");
}

function transaction(fn: () => void) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
