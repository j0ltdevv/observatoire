/**
 * API publique (PRD §21-23).
 *
 * Trois règles :
 *   - chaque réponse indique la date de calcul et le périmètre ;
 *   - aucun chiffre sans sa requête source, reproductible ;
 *   - `/api/v1/export/*.csv` est stable : une colonne renommée casse les
 *     traitements des journalistes, donc les noms sont figés ici.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { toCsv, CSV_BOM } from "@/lib/csv";
import type { DisplayStatus } from "@/types";

export const dynamic = "force-dynamic";

/** En-tête commun : sans ça, un chiffre floats sans contexte. */
function envelope(body: unknown, params: URLSearchParams) {
  return NextResponse.json({
    genere_le: new Date().toISOString(),
    perimetre: "France métropolitaine (hors DOM et collectivités d'outre-mer)",
    base: "Ministère de l'Éducation nationale, identifiants UAI",
    filtres: Object.fromEntries(params),
    ...(body as object),
  });
}

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

// ------------------------------------------------------------------ /stats

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const db = getDb();

  const filters: Record<string, unknown> = {
    scope: "FR_METRO",
    region: one(params.get("region") ?? undefined),
    department: one(params.get("department") ?? undefined),
    academy: one(params.get("academy") ?? undefined),
  };

  const { getStats } = await import("@/lib/db/queries");
  const stats = getStats(filters as never);

  return envelope(
    {
      // Le libellé est normatif : ce nombre n'est PAS un décompte de mappings.
      indicateur: "établissements avec au moins un signalement documenté",
      ...stats,
      avertissement:
        "« aucune information » ne signifie pas « aucune mobilisation ». " +
        "Les statuts EXPIRE sont des informations documentées mais trop anciennes.",
    },
    params,
  );
}

// ------------------------------------------------------------------ /schools

export async function GET_schools(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const { listSchools, countSchools } = await import("@/lib/db/queries");

  const limit = Math.min(Number(params.get("limit") ?? 200), 5000);
  const offset = Number(params.get("offset") ?? 0);

  const f = {
    scope: "FR_METRO" as const,
    search: one(params.get("search") ?? undefined),
    region: one(params.get("region") ?? undefined),
    department: one(params.get("department") ?? undefined),
    academy: one(params.get("academy") ?? undefined),
    schoolType: one(params.get("type") ?? undefined),
    lyceesOnly: params.get("tous") !== "1",
    limit,
    offset,
  };

  const rows = listSchools(f);
  return envelope(
    {
      total: countSchools(f),
      limit,
      offset,
      resultats: rows.map((s) => ({
        uai: s.uai,
        nom: s.name,
        type: s.school_type,
        secteur: s.sector,
        adresse: s.address,
        code_postal: s.postal_code,
        commune: s.city,
        departement: { code: s.department_code, nom: s.department_name },
        region: { code: s.region_code, nom: s.region_name },
        academie: { code: s.academy_code, nom: s.academy_name },
        latitude: s.latitude,
        longitude: s.longitude,
        statut: (s as unknown as Record<string, unknown>).current_status ?? "AUCUNE_INFO",
      })),
    },
    params,
  );
}

// ------------------------------------------------- /export/mobilizations.csv

/**
 * Colonnes FIGÉES : une colonne renommée casse les traitements des
 * journalistes qui ont déjà récupéré le fichier.
 */
const CSV_COLUMNS = [
  "uai",
  "nom",
  "commune",
  "departement_code",
  "departement",
  "region",
  "academie",
  "latitude",
  "longitude",
  "statut",
  "confiance",
  "justification_confiance",
  "date_evenement",
  "statut_source",
  "type_source",
  "editeur",
  "url_source",
  "date_publication_source",
  "date_collecte",
] as const;

/**
 * `;` + BOM UTF-8 : voir lib/csv.ts. Les colonnes sont figées, l'ordre aussi.
 */
function toCsvRows(rows: Array<Record<string, unknown>>): string {
  return toCsv(CSV_COLUMNS, rows);
}

export async function GET_exportCsv(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.uai, s.name AS nom, s.city AS commune,
              s.department_code AS departement_code, s.department_name AS departement, s.region_name AS region,
              s.academy_name AS academie, s.latitude, s.longitude,
              COALESCE(c.status, 'AUCUNE_INFO') statut,
              c.confidence_level confiance,
              c.confidence_reason justification_confiance,
              c.last_event_date date_evenement,
              e.status statut_source, so.source_type type_source, so.publisher editeur,
              so.url url_source, so.published_at date_publication_source,
              so.retrieved_at date_collecte
         FROM schools s
         LEFT JOIN school_current c ON c.school_id = s.id
         LEFT JOIN mobilization_events e
                ON e.school_id = s.id AND e.review_state = 'accepted'
         LEFT JOIN event_sources es ON es.event_id = e.id
         LEFT JOIN sources so ON so.id = es.source_id
        WHERE s.scope = 'FR_METRO'
          AND c.status IS NOT NULL AND c.status <> 'AUCUNE_INFO'
        ORDER BY s.name`,
    )
    .all() as Array<Record<string, unknown>>;

  return new NextResponse(toCsvRows(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="observatoire-mobilisations.csv"',
      "X-Total-Rows": String(rows.length),
      "X-Generated-At": new Date().toISOString(),
      // Le registre est public : cache court, pas immuable.
      "Cache-Control": "public, max-age=300",
    },
  });
}

// ------------------------------------------- /export/mobilizations.geojson

export async function GET_exportGeojson(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.uai, s.name, s.city, s.department_code, s.department_name, s.region_name,
              s.latitude, s.longitude,
              COALESCE(c.status, 'AUCUNE_INFO') statut,
              c.confidence_level confiance, c.confidence_reason justification_confiance,
              c.last_event_date date_evenement
         FROM schools s
         JOIN school_current c ON c.school_id = s.id
        WHERE s.scope = 'FR_METRO' AND c.status <> 'AUCUNE_INFO'
        ORDER BY s.name`,
    )
    .all() as Array<Record<string, unknown>>;

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
    properties: {
      uai: r.uai,
      nom: r.name,
      commune: r.city,
      departement: r.department_code,
      region: r.region_name,
      statut: r.statut,
      confiance: r.confiance,
      justification: r.justification_confiance,
      date_evenement: r.date_evenement,
    },
  }));

  return NextResponse.json(
    {
      type: "FeatureCollection",
      genere_le: new Date().toISOString(),
      perimetre: "France métropolitaine",
      avertissement:
        "Aucune géométrie administrative n'est incluse : ce sont des points d'établissement.",
      features,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

// ------------------------------------------------- /export/comparaison.csv

export async function GET_comparCsv() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT publisher, figure_text, figure, definition, scope, reference_date, source_url
         FROM external_counts ORDER BY reference_date DESC, publisher`,
    )
    .all() as Array<Record<string, unknown>>;

  const COLS = ["acteur", "chiffre_publie", "valeur", "definition", "perimetre", "date", "url"];
  const corps = toCsv(COLS, rows.map((r) => ({
    acteur: r.publisher,
    chiffre_publie: r.figure_text,
    valeur: r.figure,
    definition: r.definition,
    perimetre: r.scope,
    date: r.reference_date,
    url: r.source_url,
  })));

  return new NextResponse(corps, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="comparaison-comptages.csv"',
      "X-Total-Rows": String(rows.length),
    },
  });
}

// Types exportés utilisés par le routeur.
export type { DisplayStatus };
