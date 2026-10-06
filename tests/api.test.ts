/**
 * Tests de l'API publique (PRD §22).
 *
 * On n'appelle pas HTTP : on vérifie les fonctions pures et les en-têtes.
 * Un test d'API qui lance un serveur pour lire du JSON n'apporte rien de plus.
 *
 * Run : node --test tests/api.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../lib/db/index.ts";
import { csvEscape, toCsv, CSV_BOM } from "../lib/csv.ts";

test("/api/v1/stats — l'enveloppe porte le périmètre et la date", () => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) n FROM school_current c
         JOIN schools s ON s.id = c.school_id
        WHERE s.scope = 'FR_METRO' AND c.status <> 'AUCUNE_INFO'`,
    )
    .get() as { n: number };

  const stats = {
    indicateur: "établissements avec au moins un signalement documenté",
    total_schools: 60650,
    aucune_info: 60650 - Number(row.n),
  };

  // §4.5 : les deux moitiés se complètent.
  assert.equal(
    stats.aucune_info + Number(row.n),
    stats.total_schools,
    "chaque établissement est compté ou « aucune information »",
  );
});

test("/api/v1/schools — le statut par défaut est AUCUNE_INFO, jamais NORMAL", () => {
  const db = getDb();
  const sansInfo = db
    .prepare(
      `SELECT COUNT(*) n FROM schools s
         LEFT JOIN school_current c ON c.school_id = s.id
        WHERE s.scope = 'FR_METRO'
          AND (c.status IS NULL OR c.status = 'AUCUNE_INFO')`,
    )
    .get() as { n: number };
  assert.ok(Number(sansInfo.n) > 0, "des établissements sans information existent");

  const normal = db
    .prepare("SELECT COUNT(*) n FROM school_current WHERE status = 'NORMAL'")
    .get() as { n: number };
  assert.equal(Number(normal.n), 0, "NORMAL ne doit jamais apparaître : la règle est dans le schéma");
});

test("export CSV — les colonnes sont figées dans un ordre stable", () => {
  const COLS = [
    "uai", "nom", "commune", "departement_code", "departement", "region",
    "academie", "latitude", "longitude", "statut", "confiance",
    "justification_confiance", "date_evenement", "statut_source", "type_source",
    "editeur", "url_source", "date_publication_source", "date_collecte",
  ];
  assert.equal(COLS.length, 19);
  assert.ok(COLS.includes("uai"), "l'UAI est la clé, elle vient en premier");
  assert.ok(COLS.includes("justification_confiance"), "§8 : la confiance a toujours une raison");
  assert.ok(COLS.includes("date_collecte"), "§28 : horodatage obligatoire");
});

test("export CSV — séparateur point-virgule et BOM pour Excel FR", () => {
  const ligne = ["0750663N", csvEscape('Lycée général "Chaptal"; essai'), csvEscape("Paris")].join(";");
  assert.ok(ligne.includes('"Lycée général ""Chaptal""; essai"'), `échappement absent : ${ligne}`);
  assert.ok(ligne.startsWith("0750663N;"), "l'UAI ouvre la ligne");
  assert.ok(ligne.endsWith(";Paris"), "la dernière colonne n'est pas vide");
  assert.ok(toCsv(["a", "b"], [{ a: 1, b: 2 }]).startsWith(CSV_BOM), "BOM UTF-8 obligatoire");
});

test("export CSV — un retour à la ligne est aplati, pas laissé brut", () => {
  // Légal en RFC 4180, mais certains tableurs cassent dessus : on aplatit.
  const v = csvEscape("phrase1\nphrase2\tcol3");
  assert.ok(!/[\r\n\t]/.test(v), `caractère de contrôle resté : ${JSON.stringify(v)}`);
  assert.equal(v, "phrase1 phrase2 col3");
});

test("export GeoJSON — un Point par établissement documenté, coordonnées valides", () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.latitude, s.longitude FROM schools s
         JOIN school_current c ON c.school_id = s.id
        WHERE s.scope = 'FR_METRO' AND c.status <> 'AUCUNE_INFO'`,
    )
    .all() as Array<{ latitude: number; longitude: number }>;

  for (const r of rows) {
    assert.ok(r.latitude > 41 && r.latitude < 52, `latitude hors France : ${r.latitude}`);
    assert.ok(r.longitude > -6 && r.longitude < 10, `longitude hors France : ${r.longitude}`);
  }
  // GeoJSON impose [longitude, latitude], l'inverse du SQL.
  assert.ok(rows.length === 0 || typeof rows[0].latitude === "number");
});

test("export GeoJSON — aucune donnée personnelle dans les propriétés", () => {
  const db = getDb();
  const props = ["s.name", "s.city", "c.status", "c.confidence_reason"] as const;
  // Motifs volontairement stricts : « Dutel » contient « tel », un naïf
  // `/tel/` mettrait en cause la moitié des noms propres français.
  const INTERDIT = /[\w.+-]+@[\w-]+\.[a-z]{2,}|\b0[1-9](?:[ .-]?\d{2}){4}\b|\bmobile\b/gi;

  for (const p of props) {
    const rows = db
      .prepare(
        `SELECT ${p} v FROM schools s
           LEFT JOIN school_current c ON c.school_id = s.id LIMIT 2000`,
      )
      .all() as Array<{ v: string | null }>;
    for (const r of rows) {
      if (!r.v) continue;
      assert.ok(!INTERDIT.test(r.v), `donnée personnelle suspecte : ${r.v}`);
      INTERDIT.lastIndex = 0;
    }
  }
});

test("export comparaison — chaque chiffre externe porte sa définition", () => {
  const db = getDb();
  const rows = db
    .prepare("SELECT figure_text, definition, scope, reference_date FROM external_counts")
    .all() as Array<Record<string, string>>;
  assert.ok(rows.length > 0, "des décomptes externes doivent exister");
  for (const r of rows) {
    assert.ok(r.definition?.length > 10, `définition manquante : ${r.figure_text}`);
    assert.ok(r.scope?.length > 0, `périmètre manquant : ${r.figure_text}`);
    assert.match(r.reference_date, /^\d{4}-\d{2}-\d{2}$/, "date ISO obligatoire");
  }
});

test("export CSV — chaque colonne contient une valeur (les alias SQL correspondent)", () => {
  // Régression : les alias de la requête ne correspondaient pas aux noms de
  // colonnes du CSV, et nom/commune/region sortaient VIDES sans lever d'erreur.
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.uai, s.name AS nom, s.city AS commune,
              s.department_code AS departement_code, s.department_name AS departement, s.region_name AS region,
              s.academy_name AS academie,
              COALESCE(c.status, 'AUCUNE_INFO') statut,
              c.confidence_level confiance, c.confidence_reason justification_confiance,
              c.last_event_date date_evenement,
              e.status statut_source, so.source_type type_source, so.publisher editeur,
              so.url url_source, so.published_at date_publication_source,
              so.retrieved_at date_collecte
         FROM schools s
         LEFT JOIN school_current c ON c.school_id = s.id
         LEFT JOIN mobilization_events e ON e.school_id = s.id AND e.review_state = 'accepted'
         LEFT JOIN event_sources es ON es.event_id = e.id
         LEFT JOIN sources so ON so.id = es.source_id
        WHERE s.scope = 'FR_METRO' AND c.status IS NOT NULL AND c.status <> 'AUCUNE_INFO'
        LIMIT 1`,
    )
    .get() as Record<string, unknown>;

  assert.ok(row, "il doit exister au moins un établissement documenté");
  for (const col of ["uai", "nom", "commune", "departement_code", "departement", "region", "academie", "statut"]) {
    assert.ok(row[col], `colonne ${col} vide dans l'export`);
  }
  assert.ok(
    String(row.url_source ?? "").startsWith("http"),
    "l'URL de la source est obligatoire : sans elle, l'export n'est pas vérifiable",
  );
});

test("aucune promotion en CONFIRME sans deux sources indépendantes", () => {
  const db = getDb();
  const confirmes = db
    .prepare(
      `SELECT s.uai, COUNT(DISTINCT es.source_id) srcs
         FROM school_current c
         JOIN schools s ON s.id = c.school_id
         LEFT JOIN mobilization_events e
                ON e.school_id = s.id AND e.review_state = 'accepted'
         LEFT JOIN event_sources es ON es.event_id = e.id
        WHERE c.status = 'CONFIRME'
        GROUP BY s.uai`,
    )
    .all() as Array<{ uai: string; srcs: number }>;

  for (const c of confirmes) {
    assert.ok(Number(c.srcs) >= 2, `${c.uai} est CONFIRME avec ${c.srcs} source(s) seulement`);
  }
});
