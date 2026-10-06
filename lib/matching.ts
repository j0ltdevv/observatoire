/**
 * Rattachement d'un établissement cité par une source à son UAI (PRD §13).
 *
 * Priorités, strictement dans cet ordre :
 *   1. UAI explicite dans le texte ;
 *   2. nom exact + commune ;
 *   3. nom + ville (normalisation) ;
 *   4. recherche géographique (dans un rayon) ;
 *   5. validation humaine.
 *
 * Règle non négociable : **jamais de création automatique d'établissement** et
 * jamais de choix arbitraire quand plusieurs correspondent. Une ambiguïté
 * renvoie `ambiguous` avec la liste des candidats, et un humain tranche.
 */

import { all, getDb } from "./db/index.ts";
import type { Params } from "./db/index.ts";

export type MatchKind =
  | "exact_uai"
  | "name_and_city"
  | "normalized"
  | "fuzzy"
  | "too_weak"
  | "ambiguous"
  | "none";

/**
 * En dessous de ce ratio de tokens cités, on ne propose AUCUN UAI.
 * « Toulouse-Lautrec » à Bordeaux pour « Lycée Imaginaire Zorglub Toulouse »
 * plafonne à 33 % : proposer cet établissement serait une invention.
 */
const MIN_TOKEN_RATIO = 0.6;

export interface MatchCandidate {
  uai: string;
  name: string;
  city: string;
  department_name: string;
  school_type: string;
  latitude: number;
  longitude: number;
}

export interface MatchResult {
  kind: MatchKind;
  uai: string | null;
  confidence: "A" | "C" | "D" | null;
  candidates: MatchCandidate[];
  /** Pourquoi ce résultat, en clair. Jamais une décision muette. */
  reason: string;
}

const NO_MATCH: MatchResult = {
  kind: "none",
  uai: null,
  confidence: null,
  candidates: [],
  reason: "Aucun établissement correspondant. Rien n'est créé : la validation est humaine.",
};

// ---------------------------------------------------------------- normalisation

/** Minuscules, sans accent, sans ponctuation, espaces compactés. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Retire les mots génériques qui ne discriminent pas une ville.
 * « Lycée Jean Moulin de Bordeaux » → « jean moulin » + ville « bordeaux ».
 */
const STOPWORDS = new Set([
  "lycee", "lyceee", "college", "collegee", "de", "des", "du", "la", "le", "les",
  "a", "en", "au", "aux", "et", "professeur", "general", "generale", "technologique",
  "polyvalent", "municipal", "prive", "privee", "public", "section",
]);

/** Tokens significatifs d'un nom d'établissement. */
export function nameTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const UAI_RE = /\b(\d{7}[A-Z])\b/gi;

const fetchRows = (sql: string, params: Params): MatchCandidate[] =>
  all<MatchCandidate>(getDb(), sql, params);

// ------------------------------------------------------------------- résolution

/** Étape 1 : l'UAI est écrit dans le texte. C'est le cas le plus fiable. */
export function byExplicitUai(text: string): MatchResult | null {
  const found = [...new Set(text.toUpperCase().match(UAI_RE) ?? [])];
  if (found.length === 0) return null;
  if (found.length > 1) {
    return {
      kind: "ambiguous",
      uai: null,
      confidence: null,
      candidates: [],
      reason: `${found.length} UAI cités dans la même phrase (${found.join(", ")}). Validation humaine.`,
    };
  }

  const rows = fetchRows(
    `SELECT uai, name, city, department_name, school_type, latitude, longitude
       FROM schools WHERE uai = @uai`,
    { uai: found[0] },
  );
  if (rows.length === 0) {
    return {
      kind: "none",
      uai: null,
      confidence: null,
      candidates: [],
      reason: `UAI ${found[0]} cité mais absent du dataset officiel.`,
    };
  }
  return {
    kind: "exact_uai",
    uai: rows[0].uai,
    confidence: "A",
    candidates: rows,
    reason: `UAI ${found[0]} cité explicitement dans la source.`,
  };
}

/**
 * Recherche principale. La normalisation se fait à l'import (colonnes
 * `norm_name` / `norm_city`) : SQLite n'a pas d'`unaccent`, on ne peut pas
 * produire une forme sans accents en SQL.
 */
export function matchSchool(input: {
  name?: string;
  city?: string;
  department?: string;
  uai?: string;
  text?: string;
}): MatchResult {
  // 1. UAI explicite dans le texte fourni.
  const haystack = `${input.uai ?? ""} ${input.text ?? ""} ${input.name ?? ""}`;
  const explicit = byExplicitUai(haystack);
  if (explicit) return explicit;

  const name = input.name?.trim();
  const city = input.city?.trim();
  if (!name) return NO_MATCH;

  const tokens = nameTokens(name);
  if (tokens.length === 0) return NO_MATCH;

  const cityNorm = city ? normalize(city) : null;

  /**
   * Le dataset officiel range les établissements parisiens sous
   * « Paris 6e arrondissement », pas « Paris ». Une égalité stricte sur la
   * commune perdrait les 468 lycées franciliens : on matche donc le préfixe.
   */
  const sql = cityNorm
    ? `SELECT uai, name, city, department_name, school_type, latitude, longitude
         FROM schools
        WHERE scope = 'FR_METRO'
          AND (norm_city = @city OR norm_city LIKE @cityPrefix)
        ORDER BY name`
    : `SELECT uai, name, city, department_name, school_type, latitude, longitude
         FROM schools
        WHERE scope = 'FR_METRO'
        ORDER BY name`;

  const params: Params = cityNorm ? { city: cityNorm, cityPrefix: `${cityNorm} %` } : {};
  const pool = fetchRows(sql, params);

  // Sans ville, on ne peut pas faire de matching automatique : trop de
  // candidats homoonymes. C'est le cas le plus fréquent dans la presse locale.
  if (!cityNorm) {
    const loose = pool.filter((r) => tokens.every((t) => normalize(r.name).includes(t)));
    if (loose.length === 1) {
      return {
        kind: "normalized",
        uai: loose[0].uai,
        confidence: "C",
        candidates: loose,
        reason: `Nom unique dans toute la base, mais commune non précisée : confiance C, à confirmer.`,
      };
    }
    if (loose.length === 0) {
      return { ...NO_MATCH, reason: "Aucun établissement ne porte ce nom dans le pays." };
    }
    return {
      kind: loose.length > 1 ? "ambiguous" : "none",
      uai: null,
      confidence: null,
      candidates: loose.slice(0, 10),
      reason:
        loose.length > 1
          ? `Correspondance ambiguë : ${loose.length} établissements portent ce nom ` +
            `dans tout le pays. La commune est obligatoire pour trancher.`
          : "Aucun établissement ne porte ce nom dans le pays.",
    };
  }

  // Ville connue : on compare les tokens du nom.
  const inputNorm = normalize(name);
  const scored = pool
    .map((r) => {
      const rName = normalize(r.name);
      const hits = tokens.filter((t) => rName.includes(t)).length;
      // Couverture du nom OFFICIEL : « Magendie » seul ne prouve pas que la
      // source parle bien de ce lycée-là.
      const officialTokens = nameTokens(r.name);
      const covered = officialTokens.every((t) => inputNorm.includes(t));
      return {
        row: r,
        hits,
        ratio: hits / tokens.length,
        exact: inputNorm === rName,
        covered,
        officialTokens: officialTokens.length,
      };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.ratio - a.ratio || b.officialTokens - a.officialTokens);

  const best = scored[0];
  if (!best) {
    return {
      kind: "none",
      uai: null,
      confidence: null,
      candidates: [],
      reason: `« ${name} » ne correspond à aucun établissement de ${city}.`,
    };
  }

  /**
   * Confiance A exige le nom complet : soit une identité exacte, soit au moins
   * deux mots qui couvrent tous les mots du nom officiel. Un fragment unique
   * (« Magendie ») plafonne à C.
   */
  const strong = best.exact || (tokens.length >= 2 && best.covered);

  // Trop peu de recoupement : on liste des pistes, on ne propose rien.
  if (best.ratio < MIN_TOKEN_RATIO) {
    return {
      kind: "too_weak",
      uai: null,
      confidence: null,
      candidates: scored.slice(0, 3).map((x) => x.row),
      reason:
        `Correspondance trop faible (${Math.round(best.ratio * 100)} % des mots cités) ` +
        `pour rattacher la source à un établissement. Candidats proposés pour vérification humaine.`,
    };
  }

  // Tie exact sur le meilleur score : ambiguïté, on ne tranche pas.
  const tied = scored.filter(
    (x) => x.ratio === best.ratio && x.exact === best.exact && x.covered === best.covered,
  );
  if (tied.length > 1) {
    return {
      kind: "ambiguous",
      uai: null,
      confidence: null,
      candidates: tied.slice(0, 10).map((x) => x.row),
      reason: `${tied.length} établissements de ${city} correspondent aussi bien. Validation humaine.`,
    };
  }

  return {
    kind: strong ? "name_and_city" : "fuzzy",
    uai: best.row.uai,
    confidence: strong ? "A" : "C",
    candidates: [best.row],
    reason: strong
      ? `Nom et commune correspondent exactement : ${best.row.name}, ${best.row.city}.`
      : `Correspondance partielle (${Math.round(best.ratio * 100)} % des mots cités) : ${best.row.name}, ${best.row.city}. À confirmer.`,
  };
}
