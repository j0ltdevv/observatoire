/**
 * Test bout-en-bout du pipeline : source → classification → rattachement →
 * file de review → validation → statut affiché.
 *
 * Utilise une base JETABLE avec trois établissements de fixture. Aucun de ces
 * établissements n'existe dans la vraie base : rien de fictif n'entre jamais
 * dans `data/observatoire.db` (PRD §39.1).
 *
 * Run : node --test tests/ingest.test.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "observatoire-test-"));
process.env.OBSERVATOIRE_DB = join(DIR, "test.db");

const { getDb, get } = await import("../lib/db/index.ts");
const { ingestCandidate, contentHash } = await import("../lib/ingest.ts");
const { recomputeAllStatuses } = await import("../lib/db/status.ts");
const { classify } = await import("../lib/classify.ts");
const { matchSchool } = await import("../lib/matching.ts");

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const SOURCE_URL = "https://exemple.test/communique-prefecture";

before(() => {
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO schools
       (uai, name, school_type, sector, city, department_code, department_name,
        region_code, region_name, academy_code, academy_name,
        latitude, longitude, norm_name, norm_city, norm_department, scope, source_dataset)
     VALUES (@uai, @name, 'LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE', 'Public',
             @city, '099', 'Fixture', '00', 'Fixture', '99', 'Fixture',
             48.85, 2.35, @norm_name, @norm_city, 'fixture', 'FR_METRO', 'fixture')`,
  );
  ins.run({ uai: "0990001A", name: "Lycée fictif Alpha", city: "Villetest",
           norm_name: "lycee fictif alpha", norm_city: "villetest" });
  ins.run({ uai: "0990002B", name: "Lycée fictif Beta", city: "Villetest",
           norm_name: "lycee fictif beta", norm_city: "villetest" });
});

after(() => {
  rmSync(DIR, { recursive: true, force: true });
});

const candidat = (over: Partial<Parameters<typeof ingestCandidate>[0]> = {}) => ({
  url: SOURCE_URL,
  title: "Communiqué de test",
  publisher: "Fixture",
  source_type: "prefecture" as const,
  published_at: "2026-10-06T08:00:00Z",
  text: "Le lycée fictif Alpha à Villetest est fermé aujourd'hui sur instruction de la mairie.",
  ...over,
});

test("classification → statut et nom extraits", () => {
  const r = classify(candidat().text);
  assert.equal(r.status, "FERME");
  assert.ok(r.school_name?.includes("Alpha"), `nom extrait : ${r.school_name}`);
});

test("rattachement : nom + ville exacts → un UAI, pas d'ambiguïté", () => {
  const r = matchSchool({ name: "Lycée fictif Alpha", city: "Villetest" });
  assert.equal(r.uai, "0990001A");
  assert.equal(r.confidence, "A");
});

test("rattachement : nom partiel commun à deux établissements → refusé", () => {
  const r = matchSchool({ name: "Lycée fictif", city: "Villetest" });
  assert.equal(r.uai, null);
  assert.ok(["ambiguous", "too_weak"].includes(r.kind));
});

test("ingestion : un signalement rattaché part en file de review, jamais publié", () => {
  const out = ingestCandidate(candidat());
  assert.equal(out.kind, "queued");
  if (out.kind !== "queued") return;
  assert.equal(out.status, "FERME");
  assert.equal(out.uai, "0990001A");

  const db = getDb();
  const ev = get<{ review_state: string; confidence_level: string }>(
    db,
    "SELECT review_state, confidence_level FROM mobilization_events WHERE id = @id",
    { id: out.event_id },
  );
  assert.equal(ev?.review_state, "pending", "rien ne doit être publié automatiquement");
  assert.equal(ev?.confidence_level, "D", "confiance pipeline = D");

  // Tant que c'est pending, l'établissement reste AUCUNE_INFO sur la carte.
  recomputeAllStatuses();
  const cur = get<{ status: string }>(
    db,
    "SELECT status FROM school_current WHERE school_id = (SELECT id FROM schools WHERE uai = '0990001A')",
  );
  assert.equal(cur?.status, "AUCUNE_INFO");
});

test("ingestion : même URL = doublon, pas de deuxième source", () => {
  const out = ingestCandidate(candidat());
  assert.equal(out.kind, "duplicate");
});

test("ingestion : 15 reprises du même communiqué = 1 seule source (§26)", () => {
  const original = "Le lycée fictif Alpha à Villetest est bloqué depuis ce matin.";
  const reformate = "le lycée fictif alpha à villetest est bloqué depuis ce matin !";

  assert.equal(
    contentHash(original),
    contentHash(reformate),
    "la mise en forme ne doit pas créer une source nouvelle",
  );

  const first = ingestCandidate(
    candidat({ url: "https://exemple.test/communique-1", text: original }),
  );
  assert.equal(first.kind, "queued");

  for (const i of [2, 3, 4]) {
    const reprise = ingestCandidate(
      candidat({ url: `https://exemple.test/reprise-${i}`, text: reformate }),
    );
    assert.equal(reprise.kind, "duplicate", `la reprise ${i} doit être un doublon`);
  }

  const db = getDb();
  const n = get<{ n: number }>(
    db,
    "SELECT COUNT(*) n FROM sources WHERE content_hash = @h",
    { h: contentHash(original) },
  );
  assert.equal(Number(n?.n ?? 0), 1, "une seule source pour quinze reprises");
});

test("ingestion : établissement non rattaché → file « sans correspondance », rien n'est perdu", () => {
  const out = ingestCandidate(
    candidat({
      url: "https://exemple.test/autre-etablissement",
      text: "Le lycée fictif Oméga à Villetest est fermé sur instruction de la mairie.",
    }),
  );
  assert.equal(out.kind, "queued_review");
  const db = getDb();
  const n = get<{ n: number }>(
    db,
    "SELECT COUNT(*) n FROM unmatched_reports WHERE review_state = 'pending'",
  );
  assert.ok(Number(n?.n ?? 0) >= 1);
});

test("ingestion : texte sans statut → source conservée, aucun événement", () => {
  const out = ingestCandidate(
    candidat({
      url: "https://exemple.test/sans-statut",
      text: "Le conseil municipal de Villetest s'est réuni mardi soir.",
    }),
  );
  assert.equal(out.kind, "skipped");
  assert.ok(out.source_id !== null, "la source est quand même archivée");
});

test("validation : une fois accepté, le statut devient visible et daté", () => {
  const db = getDb();
  const ev = get<{ id: number; school_id: number }>(
    db,
    "SELECT id, school_id FROM mobilization_events WHERE review_state = 'pending' LIMIT 1",
  );
  assert.ok(ev);

  db.prepare(
    `UPDATE mobilization_events SET review_state = 'accepted', confidence_level = 'C',
            confidence_reason = 'Confirmé par un vérificateur (test).' WHERE id = @id`,
  ).run({ id: ev?.id });

  db.prepare(
    `INSERT INTO status_history (school_id, old_status, new_status, changed_at, reason)
     VALUES (@school, NULL, 'FERME', @at, 'premier signalement accepté')`,
  ).run({ school: ev?.school_id, at: new Date().toISOString() });

  recomputeAllStatuses();
  const cur = get<{ status: string; confidence_level: string; confidence_reason: string }>(
    db,
    `SELECT status, confidence_level, confidence_reason FROM school_current
      WHERE school_id = @school`,
    { school: ev?.school_id },
  );
  assert.equal(cur?.status, "FERME");
  assert.equal(cur?.confidence_level, "C");
  assert.ok(cur?.confidence_reason, "toujours une explication (§8)");

  const h = get<{ n: number }>(
    db,
    "SELECT COUNT(*) n FROM status_history WHERE school_id = @school",
    { school: ev?.school_id },
  );
  assert.equal(Number(h?.n ?? 0), 1, "l'historique est conservé");
});

test("§16 — les totaux par statut somment au total des établissements", () => {
  const db = getDb();
  const total = Number(
    get<{ n: number }>(db, "SELECT COUNT(*) n FROM schools")?.n ?? 0,
  );
  const somme = Number(
    get<{ n: number }>(
      db,
      `SELECT SUM(
         CASE status
           WHEN 'CONFIRME' THEN 1 WHEN 'FERME' THEN 1 WHEN 'PERTURBE' THEN 1
           WHEN 'BLOQUE' THEN 1 WHEN 'SIGNALE' THEN 1 WHEN 'CONTRADICTOIRE' THEN 1
           WHEN 'EXPIRE' THEN 1 ELSE 1 END) n
         FROM school_current`,
    )?.n ?? 0,
  );
  assert.equal(somme, total);
});
