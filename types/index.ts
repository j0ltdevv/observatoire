/**
 * Types partagés. Le vocabulaire est celui du PRD §7 et §8 — un seul champ
 * "mobilisé" est interdit, on expose le statut ET la confiance.
 */

export type EventStatus =
  | "SIGNALE"
  | "CONFIRME"
  | "FERME"
  | "PERTURBE"
  | "BLOQUE"
  | "CONTRADICTOIRE";

/** Statut affiché, dérivé : jamais stocké comme vérité manuelle. */
export type DisplayStatus = EventStatus | "AUCUNE_INFO" | "EXPIRE";

export type ConfidenceLevel = "A" | "B" | "C" | "D" | "CONTRADICTOIRE";

export type SourceType =
  | "official"
  | "school"
  | "prefecture"
  | "local_media"
  | "national_media"
  | "organization"
  | "public_statement"
  | "other";

export type ReviewState = "pending" | "review" | "accepted" | "rejected";

export interface School {
  id: number;
  uai: string;
  name: string;
  official_name: string | null;
  school_type: string;
  nature_code: number | null;
  sector: string;
  address: string | null;
  postal_code: string | null;
  city: string;
  city_code: string | null;
  department_code: string;
  department_name: string;
  region_code: string;
  region_name: string;
  academy_code: string;
  academy_name: string;
  latitude: number;
  longitude: number;
  scope: "FR_METRO" | "FR_OUTREMER";
  open_state: string | null;
  source_dataset: string;
  source_updated_at: string;
}

export interface Source {
  id: number;
  url: string;
  title: string | null;
  publisher: string | null;
  source_type: SourceType;
  published_at: string | null;
  retrieved_at: string;
  content_hash: string | null;
  origin_url: string | null;
}

export interface MobilizationEvent {
  id: number;
  school_id: number;
  status: EventStatus;
  description: string;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
  detected_at: string;
  event_date: string;
  valid_until: string | null;
  review_state: ReviewState;
  created_by: string;
}

export interface SchoolStatus {
  school_id: number;
  status: DisplayStatus;
  confidence_level: ConfidenceLevel | null;
  confidence_reason: string | null;
  last_event_date: string | null;
}

/** Couleurs de la carte : statut, jamais opinion politique (PRD §18). */
export const STATUS_COLORS: Record<DisplayStatus, string> = {
  CONFIRME: "#16a34a", // vert
  SIGNALE: "#eab308", // jaune
  FERME: "#2563eb", // bleu
  PERTURBE: "#f97316", // orange
  BLOQUE: "#9333ea", // violet (le PRD ne le fixe pas : BLOQUE ≠ FERME)
  CONTRADICTOIRE: "#dc2626", // rouge
  EXPIRE: "#f97316", // orange = information ancienne
  AUCUNE_INFO: "#9ca3af", // gris = aucune donnée récente, PAS "normal"
};

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  CONFIRME: "Confirmé",
  SIGNALE: "Signalé",
  FERME: "Fermé",
  PERTURBE: "Perturbé",
  BLOQUE: "Bloqué",
  CONTRADICTOIRE: "Contradictoire",
  EXPIRE: "Information ancienne",
  AUCUNE_INFO: "Aucune information récente",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  A: "A — source institutionnelle directe, confirmée indépendamment",
  B: "B — plusieurs sources indépendantes concordantes",
  C: "C — une seule source crédible",
  D: "D — source indirecte, information ancienne, contexte incomplet",
  CONTRADICTOIRE: "Sources incompatibles",
};
