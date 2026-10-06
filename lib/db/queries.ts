/**
 * Requêtes de lecture. Toute statistique affichée passe par ici, pour être
 * reproductible depuis la base (PRD §16, §39.14).
 *
 * Filtres : région, département, académie, statut, type, date, recherche.
 */

import { all, get, getDb, type Params } from "./index.ts";
import { DEFAULT_SCOPE, type Scope } from "../geo.ts";

export { getDb } from "./index.ts";
import type { DisplayStatus, School, SchoolStatus } from "../../types/index.ts";

export interface Filters {
  scope?: Scope;
  region?: string;
  department?: string;
  academy?: string;
  status?: DisplayStatus[];
  schoolType?: string;
  /** Lycées uniquement (nature lycée, sections exclues). */
  lyceesOnly?: boolean;
  search?: string;
  /** Statut plus récent que cette date ISO. */
  since?: string;
  limit?: number;
  offset?: number;
}

/**
 * Une "section d'enseignement" est une annexe d'un établissement, pas un
 * établissement autonome : la compter comme un lycée gonflerait les stats.
 */
export const LYCEE_TYPE_CLAUSE = `school_type LIKE 'LYCEE%'
  AND school_type NOT LIKE 'SECTION%'`;

/** Ligne lue non typée : les valeurs sont castées au point d'usage. */
type Row = Record<string, unknown>;

/**
 * `node:sqlite` rejette un paramètre nommé présent dans l'objet mais absent
 * de la requête ("Unknown named parameter"). On n'ajoute donc limit/offset que
 * pour les requêtes qui les interpolent réellement.
 */
function buildWhere(f: Filters, paginate = false): { sql: string; params: Params } {
  const clauses: string[] = ["s.scope = @scope"];
  const params: Params = { scope: f.scope ?? DEFAULT_SCOPE };
  if (paginate) {
    params.limit = f.limit ?? 500;
    params.offset = f.offset ?? 0;
  }

  if (f.region) { clauses.push("s.region_code = @region"); params.region = f.region; }
  if (f.department) { clauses.push("s.department_code = @department"); params.department = f.department; }
  if (f.academy) { clauses.push("s.academy_code = @academy"); params.academy = f.academy; }
  if (f.schoolType) { clauses.push("s.school_type = @schoolType"); params.schoolType = f.schoolType; }
  if (f.lyceesOnly) clauses.push(LYCEE_TYPE_CLAUSE);

  if (f.since) {
    clauses.push(
      `(cur.last_event_date IS NOT NULL AND cur.last_event_date >= @since)
        OR (cur.last_event_date IS NULL AND s.source_updated_at >= @since)`,
    );
    params.since = f.since;
  }

  if (f.status?.length) {
    const marks = f.status.map((_, i) => `@status${i}`);
    clauses.push(`cur.status IN (${marks.join(", ")})`);
    f.status.forEach((st, i) => { params[`status${i}`] = st; });
  }

  if (f.search?.trim()) {
    clauses.push(
      `(s.name LIKE @search COLLATE NOCASE
        OR s.city LIKE @search COLLATE NOCASE
        OR s.uai LIKE @search COLLATE NOCASE
        OR s.official_name LIKE @search COLLATE NOCASE)`,
    );
    params.search = `%${f.search.trim()}%`;
  }

  return { sql: clauses.join(" AND "), params };
}

const SELECT_BASE = `
  FROM schools s
  LEFT JOIN school_current cur ON cur.school_id = s.id
`;

export function listSchools(f: Filters = {}): School[] {
  const db = getDb();
  const { sql, params } = buildWhere(f, true);
  return all<School>(
    db,
    `SELECT s.*, cur.status AS current_status, cur.confidence_level, cur.confidence_reason,
            cur.last_event_date
     ${SELECT_BASE}
     WHERE ${sql}
     ORDER BY s.name
     LIMIT @limit OFFSET @offset`,
    params,
  );
}

export function countSchools(f: Filters = {}): number {
  const db = getDb();
  const { sql, params } = buildWhere(f);
  const row = get<Row>(db, `SELECT COUNT(*) n ${SELECT_BASE} WHERE ${sql}`, params);
  return Number(row?.n ?? 0);
}

export function getSchoolByUai(uai: string): (School & SchoolStatus) | null {
  const db = getDb();
  return (
    get<School & SchoolStatus>(
      db,
      `SELECT s.*, cur.status AS status, cur.confidence_level, cur.confidence_reason,
              cur.last_event_date, cur.updated_at AS status_updated_at
       ${SELECT_BASE}
       WHERE s.uai = @uai`,
      { uai },
    ) ?? null
  );
}

export function getEventsForSchool(schoolId: number): Row[] {
  const db = getDb();
  return all<Row>(
    db,
    `SELECT e.*, GROUP_CONCAT(
              json_object('id', s.id, 'url', s.url, 'title', s.title, 'publisher', s.publisher,
                          'source_type', s.source_type, 'published_at', s.published_at,
                          'retrieved_at', s.retrieved_at, 'origin_url', s.origin_url)
            ) AS sources
       FROM mobilization_events e
       LEFT JOIN event_sources es ON es.event_id = e.id
       LEFT JOIN sources s ON s.id = es.source_id
      WHERE e.school_id = @schoolId AND e.review_state = 'accepted'
      GROUP BY e.id
      ORDER BY e.event_date DESC`,
    { schoolId },
  );
}

export function getHistoryForSchool(schoolId: number): Row[] {
  const db = getDb();
  return all<Row>(
    db,
    `SELECT h.*, s.url, s.title, s.publisher, s.source_type
       FROM status_history h
       LEFT JOIN sources s ON s.id = h.source_id
      WHERE h.school_id = @schoolId
      ORDER BY h.changed_at DESC`,
    { schoolId },
  );
}

// -------------------------------------------------------------- statistiques

export interface GlobalStats {
  total_schools: number;
  with_signalement: number;
  confirmes: number;
  fermes: number;
  perturbes: number;
  bloques: number;
  contradictoires: number;
  expires: number;
  aucune_info: number;
  signales: number;
  /** Établissements dont la référence dataset a été rechargée récemment. */
  avec_source_recente: number;
}

const RECENT_WINDOW = "-72 hours";

/**
 * Le chiffre affiché est toujours "établissements avec au moins un
 * signalement documenté" (PRD §16), jamais "lycées mobilisés".
 */
export function getStats(f: Filters = {}): GlobalStats {
  const db = getDb();
  const { sql, params } = buildWhere(f);
  const recentParams = { ...params, recent: RECENT_WINDOW };

  const row = get<Row>(
    db,
    `SELECT
         COUNT(*) total_schools,
         SUM(CASE WHEN cur.status IS NOT NULL AND cur.status <> 'AUCUNE_INFO' THEN 1 ELSE 0 END) with_signalement,
         SUM(CASE WHEN cur.status = 'CONFIRME' THEN 1 ELSE 0 END) confirmes,
         SUM(CASE WHEN cur.status = 'FERME' THEN 1 ELSE 0 END) fermes,
         SUM(CASE WHEN cur.status = 'PERTURBE' THEN 1 ELSE 0 END) perturbes,
         SUM(CASE WHEN cur.status = 'BLOQUE' THEN 1 ELSE 0 END) bloques,
         SUM(CASE WHEN cur.status = 'CONTRADICTOIRE' THEN 1 ELSE 0 END) contradictoires,
         SUM(CASE WHEN cur.status = 'SIGNALE' THEN 1 ELSE 0 END) signales,
         SUM(CASE WHEN cur.status = 'EXPIRE' THEN 1 ELSE 0 END) expires,
         SUM(CASE WHEN cur.status IS NULL OR cur.status = 'AUCUNE_INFO' THEN 1 ELSE 0 END) aucune_info,
         SUM(CASE WHEN s.source_updated_at >= datetime('now', @recent) THEN 1 ELSE 0 END) avec_source_recente
       ${SELECT_BASE}
       WHERE ${sql}`,
    recentParams,
  );

  return Object.fromEntries(
    Object.entries(row ?? {}).map(([k, v]) => [k, Number(v ?? 0)]),
  ) as unknown as GlobalStats;
}

export function getStatsByDimension(
  dimension: "region" | "department" | "academy",
  f: Filters = {},
): Row[] {
  const db = getDb();
  const { sql, params } = buildWhere(f);
  const col = {
    region: ["s.region_code", "s.region_name"],
    department: ["s.department_code", "s.department_name"],
    academy: ["s.academy_code", "s.academy_name"],
  }[dimension];

  return all<Row>(
    db,
    `SELECT ${col[0]} AS code, ${col[1]} AS name,
            COUNT(*) total,
            SUM(CASE WHEN cur.status IS NOT NULL AND cur.status <> 'AUCUNE_INFO' THEN 1 ELSE 0 END) avec_info,
            SUM(CASE WHEN cur.status = 'CONFIRME' THEN 1 ELSE 0 END) confirmes,
            SUM(CASE WHEN cur.status = 'FERME' THEN 1 ELSE 0 END) fermes,
            SUM(CASE WHEN cur.status = 'SIGNALE' THEN 1 ELSE 0 END) signales,
            SUM(CASE WHEN cur.status = 'CONTRADICTOIRE' THEN 1 ELSE 0 END) contradictoires
     ${SELECT_BASE}
     WHERE ${sql}
     GROUP BY ${col[0]}
     ORDER BY avec_info DESC, name`,
    params,
  );
}

/**
 * Points de carte. Volontairement léger : uniquement ce que Leaflet affiche,
 * jamais les sources ni l'historique (PRD §32).
 */
export function getMapPoints(f: Filters = {}, limit = 20000): Row[] {
  const db = getDb();
  const { sql, params } = buildWhere({ ...f, limit }, true);
  return all<Row>(
    db,
    `SELECT s.uai, s.name, s.city, s.department_code, s.latitude, s.longitude,
            s.school_type, s.sector, s.academy_name, s.region_name,
            COALESCE(cur.status, 'AUCUNE_INFO') AS status,
            cur.last_event_date
     ${SELECT_BASE}
     WHERE ${sql}
     ORDER BY s.name
     LIMIT @limit OFFSET @offset`,
    params,
  );
}

export interface District {
  code: string;
  name: string;
}

export function getDistricts(): {
  regions: District[];
  departments: District[];
  academies: District[];
} {
  const db = getDb();
  const p = { scope: DEFAULT_SCOPE };
  return {
    regions: all<District>(
      db,
      `SELECT DISTINCT region_code code, region_name name FROM schools
        WHERE scope = @scope ORDER BY name`,
      p,
    ),
    departments: all<District>(
      db,
      `SELECT DISTINCT department_code code, department_name name FROM schools
        WHERE scope = @scope ORDER BY name`,
      p,
    ),
    academies: all<District>(
      db,
      `SELECT DISTINCT academy_code code, academy_name name FROM schools
        WHERE scope = @scope ORDER BY name`,
      p,
    ),
  };
}
