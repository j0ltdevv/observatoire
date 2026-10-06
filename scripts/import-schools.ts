/**
 * Import du dataset officiel Éducation nationale.
 *
 * Source : data.education.gouv.fr
 *   dataset_id : fr-en-adresse-et-geolocalisation-etablissements-premier-et-second-degre
 *   endpoint   : /api/explore/v2.1/catalog/datasets/<id>/exports/geojson
 *
 * Le serveur renvoie gzip : on force --compressed côté fetch.
 */

import { getDb, transaction, nowIso } from "../lib/db/index.ts";
import { scopeOf } from "../lib/geo.ts";
import { normalize } from "../lib/matching.ts";

export const OFFICIAL_DATASET_ID =
  "fr-en-adresse-et-geolocalisation-etablissements-premier-et-second-degre";

export const GEOJSON_URL =
  `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/${OFFICIAL_DATASET_ID}/exports/geojson`;

/** Nature UAI = lycée (second degré). Recoupé par libellé, pas par convention fragile. */
const LYCEE_LABELS = [
  "LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE",
  "LYCEE D ENSEIGNEMENT GENERAL",
  "LYCEE POLYVALENT",
  "LYCEE PROFESSIONNEL",
  "LYCEE EXPERIMENTAL",
  "SECTION ENSEIGNT GEN. ET PROF. ADAPTE",
  "SECTION D ENSEIGNEMENT PROFESSIONNEL",
  "SECTION ENSEIGT GENERAL ET TECHNOLOGIQUE",
];

export function isLycee(natureLabel: string | null | undefined): boolean {
  if (!natureLabel) return false;
  return LYCEE_LABELS.includes(natureLabel);
}

interface RawFeature {
  type: "Feature";
  geometry: { type: string; coordinates: number[] } | null;
  properties: Record<string, string | number | null>;
}

const insert = `
INSERT INTO schools (
  uai, name, official_name, school_type, nature_code, sector, address,
  postal_code, city, city_code, department_code, department_name,
  region_code, region_name, academy_code, academy_name,
  latitude, longitude, norm_name, norm_city, norm_department,
  scope, open_state, official_state,
  source_dataset, source_updated_at
) VALUES (
  @uai, @name, @official_name, @school_type, @nature_code, @sector, @address,
  @postal_code, @city, @city_code, @department_code, @department_name,
  @region_code, @region_name, @academy_code, @academy_name,
  @latitude, @longitude, @norm_name, @norm_city, @norm_department,
  @scope, @open_state, @official_state,
  @source_dataset, @source_updated_at
)
ON CONFLICT(uai) DO UPDATE SET
  name = excluded.name,
  official_name = excluded.official_name,
  address = excluded.address,
  postal_code = excluded.postal_code,
  city = excluded.city,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  norm_name = excluded.norm_name,
  norm_city = excluded.norm_city,
  norm_department = excluded.norm_department,
  scope = excluded.scope,
  open_state = excluded.open_state,
  source_updated_at = excluded.source_updated_at,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
`;

const s = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

export interface ImportReport {
  total: number;
  lycees: number;
  metropole: number;
  outremer: number;
  skipped: number;
}

export async function importSchools(): Promise<ImportReport> {
  const db = getDb();
  const res = await fetch(GEOJSON_URL, { headers: { "accept-encoding": "gzip" } });
  if (!res.ok) {
    throw new Error(
      `Dataset officiel inaccessible : HTTP ${res.status} sur ${GEOJSON_URL}. ` +
        `Vérifie l'ID "${OFFICIAL_DATASET_ID}".`,
    );
  }

  const geo = (await res.json()) as { features: RawFeature[] };
  const now = nowIso();

  const stmt = db.prepare(insert);
  let total = 0;
  let lycees = 0;
  let metropole = 0;
  let outremer = 0;
  let skipped = 0;
  const seen = new Set<string>();

  transaction(db, () => {
    for (const f of geo.features) {
      const p = f.properties;
      const uai = s(p.numero_uai);
      const lat = Number(p.latitude);
      const lon = Number(p.longitude);

      // Garde-fous : pas d'import sans identifiant stable ou sans position.
      if (!uai || seen.has(uai)) { skipped += 1; continue; }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped += 1; continue; }
      if (lat === 0 && lon === 0) { skipped += 1; continue; }

      seen.add(uai);
      const type = s(p.nature_uai_libe) ?? "INCONNU";
      const scope = scopeOf(s(p.code_postal_uai));
      if (isLycee(type)) lycees += 1;
      if (scope === "FR_METRO") metropole += 1;
      else outremer += 1;

      stmt.run({
        uai,
        name: s(p.appellation_officielle) ?? uai,
        official_name: s(p.appellation_officielle),
        school_type: type,
        nature_code: p.nature_uai === null ? null : Number(p.nature_uai),
        sector: s(p.secteur_public_prive_libe) ?? "Inconnu",
        address: s(p.adresse_uai),
        postal_code: s(p.code_postal_uai),
        city: s(p.libelle_commune) ?? "",
        city_code: s(p.code_commune),
        department_code: s(p.code_departement) ?? "",
        department_name: s(p.libelle_departement) ?? "",
        region_code: s(p.code_region) ?? "",
        region_name: s(p.libelle_region) ?? "",
        academy_code: s(p.code_academie) ?? "",
        academy_name: s(p.libelle_academie) ?? "",
        latitude: lat,
        longitude: lon,
        norm_name: normalize(s(p.appellation_officielle) ?? ""),
        norm_city: normalize(s(p.libelle_commune) ?? ""),
        norm_department: normalize(s(p.libelle_departement) ?? ""),
        scope,
        open_state: s(p.etat_etablissement_libe),
        official_state: p.etat_etablissement === null ? null : Number(p.etat_etablissement),
        source_dataset: OFFICIAL_DATASET_ID,
        source_updated_at: now,
      });
      total += 1;
    }
  });

  return { total, lycees, metropole, outremer, skipped };
}

// Exécution directe : node scripts/import-schools.ts
if (import.meta.main) {
  const t0 = Date.now();
  console.log(`Import en cours depuis ${OFFICIAL_DATASET_ID} …`);
  const r = await importSchools();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`OK en ${secs}s — ${r.total} établissements insérés, ${r.skipped} écartés`);
  console.log(`   métropole     ${r.metropole}`);
  console.log(`   outre-mer     ${r.outremer}`);
  console.log(`   dont lycées   ${r.lycees}`);
}
