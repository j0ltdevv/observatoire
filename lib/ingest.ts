/**
 * Ingestion d'un candidat issu de la presse (PRD §14).
 *
 * Règle non négociable : ce qui entre ici entre en `pending`. Rien n'est
 * publié sans validation humaine (PRD §30). Le pipeline ne décide jamais du
 * statut affiché : il prépare un dossier, un humain tranche.
 *
 * Deux issues possibles, jamais une troisième :
 *   - rattachement univoque  → `mobilization_events` (review_state = pending)
 *   - rattachement impossible → `unmatched_reports` (rien n'est perdu)
 */

import { get, getDb, nowIso, transaction } from "./db/index.ts";
import type { Params } from "./db/index.ts";
import { classify, factSentence } from "./classify.ts";
import { matchSchool } from "./matching.ts";
import type { SourceType } from "../types/index.ts";

export interface Candidate {
  url: string;
  title?: string | null;
  publisher?: string | null;
  source_type?: SourceType;
  published_at?: string | null;
  /** Date de collecte : on ne la devine pas, c'est l'heure du passage. */
  retrieved_at?: string;
  /** Corps de texte ou extrait. */
  text: string;
  /**
   * Date à laquelle l'ÉVÉNEMENT s'applique, si elle diffère de la publication.
   * Un article du 5 octobre peut rapporter une fermeture du 2 : confondre les
   * deux ferait vieillir la donnée de trois jours (PRD §28).
   */
  event_date?: string | null;
  /** URL de la source originale si celle-ci est une reprise (§26). */
  origin_url?: string | null;
}

export type IngestOutcome =
  | { kind: "queued"; event_id: number; source_id: number; uai: string; status: string }
  | { kind: "queued_review"; report_id: number; source_id: number; match_kind: string }
  | { kind: "duplicate"; source_id: number; reason: string }
  | { kind: "skipped"; source_id: number | null; reason: string };

const hash = (s: string): string => {
  // FNV-1a 32 bits : suffisant pour dédoublonner, pas pour la sécurité.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

/** Hash du contenu utile, insensible à la mise en forme. */
export const contentHash = (text: string): string =>
  hash(text.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim());

export function upsertSource(c: Candidate): { id: number; duplicate: boolean; reason: string } {
  const db = getDb();
  const existing = get<{ id: number }>(
    db,
    "SELECT id FROM sources WHERE url = @url",
    { url: c.url } as Params,
  );
  if (existing) {
    return { id: existing.id, duplicate: true, reason: "URL déjà enregistrée" };
  }

  const ch = contentHash(c.text);
  const sameContent = get<{ id: number; url: string }>(
    db,
    "SELECT id, url FROM sources WHERE content_hash = @h LIMIT 1",
    { h: ch } as Params,
  );
  if (sameContent) {
    // §26 : quinze reprises du même communiqué ne sont pas quinze sources.
    return {
      id: sameContent.id,
      duplicate: true,
      reason: `Contenu identique à une source déjà enregistrée (${sameContent.url}) : reprise, pas confirmation.`,
    };
  }

  const info = getDb()
    .prepare(
      `INSERT INTO sources
         (url, title, publisher, source_type, published_at, retrieved_at,
          content_hash, origin_url)
       VALUES (@url, @title, @publisher, @source_type, @published_at, @retrieved_at,
               @hash, @origin_url)`,
    )
    .run({
      url: c.url,
      title: c.title ?? null,
      publisher: c.publisher ?? null,
      source_type: c.source_type ?? "local_media",
      published_at: c.published_at ?? null,
      retrieved_at: c.retrieved_at ?? nowIso(),
      hash: ch,
      origin_url: c.origin_url ?? null,
    });
  return { id: Number(info.lastInsertRowid), duplicate: false, reason: "" };
}

export function ingestCandidate(c: Candidate): IngestOutcome {
  const db = getDb();
  const extraction = classify(c.text);

  // Pas de statut reconnu : la source est bien enregistrée, mais elle ne dit
  // rien d'exploitable sur un établissement. Ce n'est pas une erreur.
  if (!extraction.status) {
    const src = upsertSource(c);
    return {
      kind: "skipped",
      source_id: src.id,
      reason: "Aucun motif de statut reconnu : source conservée, aucun signalement créé.",
    };
  }

  const src = upsertSource(c);
  if (src.duplicate) {
    return { kind: "duplicate", source_id: src.id, reason: src.reason };
  }

  // Rattachement : UAI explicite d'abord, puis nom + ville.
  const match = matchSchool({
    text: c.text,
    uai: extraction.uai ?? undefined,
    name: extraction.school_name ?? undefined,
    city: extractCity(c.text),
  });

  const fact = factSentence(c.text);
  // Le statut est non nul ici : on a sorti plus haut si la classification
  // n'avait rien reconnu.
  const status = extraction.status as NonNullable<typeof extraction.status>;

  return transaction(db, () => {
    if (!match.uai) {
      const info = db
        .prepare(
          `INSERT INTO unmatched_reports
             (source_id, quoted_name, proposed_status, extract, match_kind,
              match_reason, candidates)
           VALUES (@source_id, @name, @status, @extract, @kind, @reason, @candidates)`,
        )
        .run({
          source_id: src.id,
          name: extraction.school_name,
          status: extraction.status,
          extract: fact,
          kind: match.kind,
          reason: match.reason,
          candidates: JSON.stringify(match.candidates),
        });
      return {
        kind: "queued_review" as const,
        report_id: Number(info.lastInsertRowid),
        source_id: src.id,
        match_kind: match.kind,
      };
    }

    const info = db
      .prepare(
        `INSERT INTO mobilization_events
           (school_id, status, description, confidence_level, confidence_reason,
            detected_at, event_date, review_state, created_by)
         VALUES (@school_id, @status, @description, 'D', @reason,
                 @detected_at, @event_date, 'pending', @created_by)`,
      )
      .run({
        school_id: Number(
          get<{ id: number }>(db, "SELECT id FROM schools WHERE uai = @uai", {
            uai: match.uai,
          } as Params)?.id,
        ),
        status,
        description: fact,
        reason:
          `Classification automatisée (niveau D) : motif « ${extraction.matched} ». ` +
          `Rattachement ${match.kind}. En attente de validation humaine.`,
        detected_at: nowIso(),
        event_date: c.event_date ?? c.published_at ?? nowIso(),
        created_by: "pipeline",
      });
    const eventId = Number(info.lastInsertRowid);

    db.prepare("INSERT INTO event_sources (event_id, source_id) VALUES (?, ?)").run(
      eventId,
      src.id,
    );

    return {
      kind: "queued" as const,
      event_id: eventId,
      source_id: src.id,
      uai: match.uai,
      status,
    };
  });
}

/**
 * Ville la plus vraisemblable dans le texte. Best-effort et assumé tel quel :
 * le matchingFinal le confirme ou refuse, un humain tranche sinon.
 */
export function extractCity(text: string): string | undefined {
  const m = text.match(
    /(?:à|au|dans|sur)\s+([A-ZÀ-Ö][\p{L}'’-]{2,}(?:[- ][A-ZÀ-Ö][\p{L}'’-]{2,}){0,2})/u,
  );
  return m ? m[1] : undefined;
}

/** Fait relaté par le statut, pour l'historique (PRD §28). */
export function recordHistory(schoolId: number, oldStatus: string | null, newStatus: string, reason: string, sourceId: number | null, at: string) {
  getDb()
    .prepare(
      `INSERT INTO status_history (school_id, old_status, new_status, changed_at, reason, source_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(schoolId, oldStatus, newStatus, at, reason, sourceId);
}
