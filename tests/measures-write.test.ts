/**
 * Écriture de mesures institutionnelles — base JETABLE.
 *
 * Séparé de tests/measures.test.ts, qui ne fait que lire la vraie base.
 * Un test qui écrit dans la base de production pollue les chiffres affichés :
 * c'est exactement le défaut que ce projet cherche à éviter.
 *
 * Run : node --test tests/measures-write.test.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "observatoire-mesures-"));
process.env.OBSERVATOIRE_DB = join(DIR, "test.db");

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { getDb } = await import("../lib/db/index.ts");
const { insertEntries, insertMeasure, crossCheck, listMeasures } = await import(
  "../lib/measures.ts"
);
const { upsertSource } = await import("../lib/ingest.ts");
const { recomputeAllStatuses } = await import("../lib/db/status.ts");

before(() => {
  const db = getDb();
  db.prepare(
    `INSERT INTO schools
       (uai, name, school_type, sector, city, department_code, department_name,
        region_code, region_name, academy_code, academy_name, latitude, longitude,
        norm_name, norm_city, norm_department, scope, source_dataset)
     VALUES (@uai, @name, 'LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE', 'Public',
             'Villetest', '099', 'Fixture', '00', 'Fixture', '99', 'Fixture',
             48.85, 2.35, @norm_name, 'villetest', 'fixture', 'FR_METRO', 'fixture')`,
  ).run({ uai: "0990001A", name: "Lycée fictif Alpha", norm_name: "lycee fictif alpha" });
  recomputeAllStatuses();
});

after(() => rmSync(DIR, { recursive: true, force: true }));

function creerMesure(nom: string, date: string, type = "INTERDICTION_RASSEMBLEMENT") {
  const src = upsertSource({
    url: `https://exemple.test/arret-${nom}`,
    title: `Arrêté ${nom}`,
    publisher: "Préfecture de test",
    source_type: "prefecture",
    published_at: `${date}T00:00:00Z`,
    text: `Arrêté du ${date} interdisant les rassemblements.`,
  });
  return insertMeasure({
    source_id: src.id,
    authority: "Préfecture de test",
    measure_type: type as never,
    scope: "test",
    reference_date: date,
    announced_count: 1,
  });
}

test("créer une mesure ne crée aucun événement de mobilisation", () => {
  const db = getDb();
  const avant = db.prepare("SELECT COUNT(*) n FROM mobilization_events").get() as { n: number };

  const mid = creerMesure("t1", "2026-10-05");
  insertEntries(mid, [{ raw_name: "Lycée fictif Alpha", city: "Villetest" }]);

  const apres = db.prepare("SELECT COUNT(*) n FROM mobilization_events").get() as { n: number };
  assert.equal(apres.n, avant.n, "une mesure ne doit créer aucun événement");
});

test("après création de la mesure, l'établissement reste AUCUNE_INFO", () => {
  const db = getDb();
  recomputeAllStatuses();
  const st = db
    .prepare(
      `SELECT c.status FROM school_current c
         JOIN schools s ON s.id = c.school_id WHERE s.uai = '0990001A'`,
    )
    .get() as { status: string } | undefined;
  assert.equal(st?.status, "AUCUNE_INFO");
});

test("le croisement rend la main explicite : 0 documenté sur 1 nommé", () => {
  // On désigne la bonne mesure : les tests suivants en créent d'autres.
  const m = listMeasures().find((x) => x.reference_date === "2026-10-05");
  assert.ok(m, "la mesure du 5 octobre doit exister");
  const x = crossCheck(m.id);
  assert.equal(x.entries_total, 1);
  assert.equal(x.entries_without_event, 1);
  assert.equal(x.entries_with_event, 0);
});

test("les mesures sont triées de la plus récente à la plus ancienne", () => {
  creerMesure("t2", "2026-10-06");
  const dates = listMeasures().map((m) => m.reference_date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});
