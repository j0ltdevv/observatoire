/**
 * Statut courant d'un établissement — DERIVÉ, jamais écrit à la main.
 *
 * Règle fondatrice (PRD §4.5) :
 *   AUCUNE_INFORMATION DISE "je n'ai rien trouvé", jamais "il ne se passe rien".
 * Un établissement sans événement ne reçoit donc pas NORMAL : il reçoit
 * AUCUNE_INFO. NORMAL n'existe pas dans ce module, volontairement — le
 * jour où quelqu'un l'ajoutera, il aura réintroduit le bug que le PRD
 * interdit.
 *
 * Règle d'expiration (PRD §28) : une information du 2 octobre ne
 * représente pas la situation du 6. Passé le délai, le statut devient
 * EXPIRE — il ne disparaît pas et ne redevient pas NORMAL.
 *
 * Règle de contradiction (PRD §27) : deux sources crédibles qui donnent des
 * statuts incompatibles produisent CONTRADICTOIRE. On ne désigne pas un
 * gagnant.
 */

import { all, getDb, nowIso } from "./index.ts";
import type { ConfidenceLevel, DisplayStatus, EventStatus } from "../../types/index.ts";

/** Délai de validité d'un événement, en heures, par statut. */
const FRESHNESS_HOURS: Record<EventStatus, number> = {
  // Une fermeture annoncée par une source institutionnelle tient moins longtemps
  // qu'un simple signalement : c'est une situation qui évolue dans la journée.
  FERME: 24,
  PERTURBE: 24,
  BLOQUE: 24,
  CONTRADICTOIRE: 48,
  CONFIRME: 48,
  SIGNALE: 72,
};

export const FRESHNESS_HOURS_LABEL = FRESHNESS_HOURS;

/**
 * Un simple `LIKE` sur le statut est un piège : CONTRADICTOIRE est un statut
 * à part entière, pas une variante de FERME. Les statuts qu'un événement peut
 * "porter" pour déduire un conflit sont ceux qui décrivent un état concret de
 * fonctionnement.
 */
const OPERATIONAL_STATUSES: EventStatus[] = ["FERME", "PERTURBE", "BLOQUE"];

export interface StatusComputation {
  status: DisplayStatus;
  confidence_level: ConfidenceLevel | null;
  confidence_reason: string | null;
  last_event_date: string | null;
  /** Nombre de sources indépendantes soutenant le statut. */
  source_count: number;
  /** Raisons techniques, affichables dans la fiche et dans la méthodologie. */
  notes: string[];
}

const AUCUNE: StatusComputation = {
  status: "AUCUNE_INFO",
  confidence_level: null,
  confidence_reason: null,
  last_event_date: null,
  source_count: 0,
  notes: ["Aucune information publique collectée pour cet établissement."],
};

function hoursSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 3_600_000;
}

interface EventRow {
  id: number;
  status: EventStatus;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
  event_date: string;
  valid_until: string | null;
  detected_at: string;
  source_count: number;
  source_types: string | null;
}

/**
 * Calcule le statut d'un établissement à partir de ses événements ACCEPTÉS.
 *
 * On ne prend que `review_state = 'accepted'` : un signalement en file de
 * review ne doit jamais apparaître sur la carte comme un fait (PRD §30).
 */
export function computeSchoolStatus(
  schoolId: number,
  events: EventRow[],
  now: Date = new Date(),
): StatusComputation {
  if (events.length === 0) return { ...AUCUNE, notes: [...AUCUNE.notes] };

  const notes: string[] = [];
  const considered = [...events].sort(
    (a, b) => Date.parse(b.event_date) - Date.parse(a.event_date),
  );

  // --- 1. Détection de contradiction, AVANT tout choix de statut.
  // On ne compare que les événements encore frais : un conflit vieux de
  // trois jours ne décrit pas la situation actuelle.
  const fresh = considered.filter((e) => {
    const limit = e.valid_until
      ? hoursSince(e.valid_until, now) < 0
      : hoursSince(e.event_date, now) <= FRESHNESS_HOURS[e.status];
    return limit;
  });

  if (fresh.length === 0) {
    const last = considered[0];
    const age = Math.round(hoursSince(last.event_date, now));
    notes.push(
      `Dernière information du ${last.event_date.slice(0, 10)}, soit ${age} h : trop ancienne pour ` +
        `représenter la situation actuelle. Conservée, pas effacée.`,
    );
    return {
      status: "EXPIRE",
      confidence_level: last.confidence_level,
      confidence_reason: last.confidence_reason,
      last_event_date: last.event_date,
      source_count: last.source_count,
      notes,
    };
  }

  const operational = fresh.filter((e) => OPERATIONAL_STATUSES.includes(e.status));
  const distinct = new Set(operational.map((e) => e.status));
  if (distinct.size > 1) {
    notes.push(
      `Sources crédibles incompatibles : ${[...distinct].join(" vs ")}. ` +
        `Aucun statut arbitraire n'est choisi.`,
    );
    return {
      status: "CONTRADICTOIRE",
      confidence_level: "CONTRADICTOIRE",
      confidence_reason: `Conflit entre ${distinct.size} statuts opérationnels documentés.`,
      last_event_date: fresh[0].event_date,
      source_count: fresh.reduce((n, e) => n + e.source_count, 0),
      notes,
    };
  }

  // --- 2. Pas de conflit : on prend le statut opérationnel le plus récent.
  //      À statut égal, la confiance la plus forte tranche l'affichage.
  const best = fresh.find((e) => OPERATIONAL_STATUSES.includes(e.status));

  if (!best) {
    // Que des signalements / confirmations sans état opérationnel précis.
    const confirmed = fresh.find((e) => e.status === "CONFIRME");
    const pick = confirmed ?? fresh[0];
    notes.push(
      confirmed
        ? "Signalement corroboré par une source considérée comme fiable."
        : "Source publique signalant une mobilisation, sans corroboration indépendante.",
    );
    return {
      status: pick.status,
      confidence_level: pick.confidence_level,
      confidence_reason: pick.confidence_reason,
      last_event_date: pick.event_date,
      source_count: pick.source_count,
      notes,
    };
  }

  // --- 3. Promotion CONFIRME (PRD §8) : corroboration par une source
  //      indépendante. Deux critères cumulatifs, jamais l'IA seule :
  //      - au moins 2 sources de nature différente (anti-dédup §26) ;
  //      - au moins une source institutionnelle ou officielle.
  const distinctSourceTypes = new Set(
    (best.source_types ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const hasInstitutional = distinctSourceTypes.has("official") || distinctSourceTypes.has("prefecture");

  if (best.source_count >= 2 && hasInstitutional && best.status !== "CONFIRME") {
    notes.push(
      `Promu en CONFIRME : ${best.source_count} sources indépendantes dont une institutionnelle.`,
    );
    return {
      status: "CONFIRME",
      confidence_level: "A",
      confidence_reason:
        `Source institutionnelle directe + ${best.source_count - 1} autre(s) source(s) ` +
        `indépendante(s), information récente.`,
      last_event_date: best.event_date,
      source_count: best.source_count,
      notes,
    };
  }

  notes.push(
    `${best.source_count} source(s) — ` +
      `${best.source_count < 2 ? "corroboration indépendante absente" : "sans source institutionnelle"}.`,
  );

  return {
    status: best.status,
    confidence_level: best.confidence_level,
    confidence_reason: best.confidence_reason,
    last_event_date: best.event_date,
    source_count: best.source_count,
    notes,
  };
}

/**
 * Recalcule `school_current` pour tous les établissements.
 * Idempotent : on repart toujours des événements, jamais du cache.
 */
export function recomputeAllStatuses(now: Date = new Date()): number {
  const db = getDb();

  const events = all<EventRow & { school_id: number }>(
    db,
    `SELECT e.id, e.school_id, e.status, e.confidence_level, e.confidence_reason,
            e.event_date, e.valid_until, e.detected_at,
            (SELECT COUNT(*) FROM event_sources es WHERE es.event_id = e.id) AS source_count,
            (SELECT GROUP_CONCAT(DISTINCT s.source_type)
               FROM event_sources es JOIN sources s ON s.id = es.source_id
              WHERE es.event_id = e.id) AS source_types
       FROM mobilization_events e
      WHERE e.review_state = 'accepted'`,
  );

  const bySchool = new Map<number, EventRow[]>();
  for (const e of events) {
    const list = bySchool.get(e.school_id);
    if (list) list.push(e);
    else bySchool.set(e.school_id, [e]);
  }

  const schoolIds = db.prepare("SELECT id FROM schools").all() as Array<{ id: number }>;

  const upsert = db.prepare(
    `INSERT INTO school_current
       (school_id, status, confidence_level, confidence_reason, last_event_date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(school_id) DO UPDATE SET
       status = excluded.status,
       confidence_level = excluded.confidence_level,
       confidence_reason = excluded.confidence_reason,
       last_event_date = excluded.last_event_date,
       updated_at = excluded.updated_at`,
  );
  const clear = db.prepare("DELETE FROM school_current");

  const ts = nowIso();
  db.exec("BEGIN");
  try {
    clear.run();
    let written = 0;
    for (const { id } of schoolIds) {
      const c = computeSchoolStatus(id, bySchool.get(id) ?? [], now);
      upsert.run(id, c.status, c.confidence_level, c.confidence_reason, c.last_event_date, ts);
      written += 1;
    }
    db.exec("COMMIT");
    return written;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

if (import.meta.main) {
  const n = recomputeAllStatuses();
  console.log(`school_current recalculé pour ${n} établissements.`);
}
