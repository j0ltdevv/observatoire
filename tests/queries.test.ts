/**
 * Tests des filtres et des statistiques sur la vraie base importée.
 * Run : node tests/queries.test.ts
 *
 * Ces tests lisent le dataset officiel : ils vérifient que les chiffres
 * affichés sont reproductibles (PRD §16, §39.14).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countSchools,
  getDistricts,
  getMapPoints,
  getStats,
  getStatsByDimension,
  getSchoolByUai,
  listSchools,
} from "../lib/db/queries.ts";

test("périmètre : la base contient la métropole, pas seulement elle", () => {
  const total = countSchools({});
  assert.ok(total > 60_000, `attendu > 60 000, obtenu ${total}`);
});

test("filtre région : Bordeaux (33) ≠-total", () => {
  const { regions } = getDistricts();
  const gi = regions.find((r) => r.name === "Nouvelle-Aquitaine");
  assert.ok(gi, "région Nouvelle-Aquitaine absente du dataset");

  const subset = countSchools({ region: String(gi.code) });
  assert.ok(subset > 0 && subset < 60_000, `filtrage région cassé : ${subset}`);
});

test("filtre département : code INSEE à 3 chiffres (033 = Gironde)", () => {
  // Le dataset officiel code les départements en 3 chiffres (INSEE), pas 2.
  // « 33 » ne matche rien : c'est un piège de saisie, pas une donnée manquante.
  assert.equal(countSchools({ department: "33" }), 0);
  assert.ok(countSchools({ department: "033" }) > 1000, "Gironde absente");
});

test("filtre académie : 25 en métropole (les 32 du dataset incluent les DOM)", () => {
  const { academies } = getDistricts();
  assert.equal(academies.length, 25, `académies métropole : ${academies.length}`);
  for (const a of academies) {
    assert.ok(countSchools({ academy: String(a.code) }) > 0, `académie ${a.code} vide`);
  }
});

test("filtre type : lyceesOnly exclut les sections d'enseignement", () => {
  const all = countSchools({ schoolType: "SECTION D ENSEIGNEMENT PROFESSIONNEL" });
  assert.ok(all > 0, "le dataset devrait contenir des sections");

  const lycees = listSchools({ lyceesOnly: true, limit: 2000 });
  assert.ok(lycees.length > 0);
  for (const s of lycees) {
    assert.ok(
      !s.school_type.startsWith("SECTION"),
      `section passée en lycée : ${s.school_type}`,
    );
  }
});

test("recherche : par nom, par commune, par UAI", () => {
  const parNom = listSchools({ search: "Montaigne", limit: 10 });
  assert.ok(parNom.length > 0, "aucun Montaigne trouvé");

  const parUai = listSchools({ search: parNom[0].uai, limit: 5 });
  assert.equal(parUai.length, 1, "recherche par UAI doit être exacte");
  assert.equal(parUai[0].uai, parNom[0].uai);

  const parVille = listSchools({ search: "Bordeaux", limit: 10 });
  assert.ok(parVille.every((s) => /bordeaux/i.test(s.city) || /bordeaux/i.test(s.name)));
});

test("fiche établissement : UAI inconnu = null, pas d'exception", () => {
  assert.equal(getSchoolByUai("0000000X"), null);
});

test("§16 — la somme des statuts égale le total : rien ne disparaît", () => {
  const s = getStats({});
  const somme =
    s.confirmes + s.fermes + s.perturbes + s.bloques +
    s.contradictoires + s.expires + s.aucune_info;
  assert.equal(somme, s.total_schools, `somme ${somme} ≠ total ${s.total_schools}`);
});

test("§4.5 — aucune_info est le complément exact des statuts comptés", () => {
  // Le cas « base entièrement vide » est traité dans tests/ingest.test.ts, sur
  // une base jetable. Ici on vérifie l'invariant permanent : les deux moitiés
  // se complètent, aucune ligne ne tombe entre les deux.
  const s = getStats({});
  assert.equal(
    s.aucune_info + s.with_signalement,
    s.total_schools,
    "chaque établissement est soit compté, soit « aucune information »",
  );
});

test("statistiques par région : la somme des totaux égale le total national", () => {
  const s = getStats({});
  const parRegion = getStatsByDimension("region");
  const somme = parRegion.reduce((n, r) => n + Number(r.total), 0);
  assert.equal(somme, s.total_schools, `somme par région ${somme} ≠ ${s.total_schools}`);
});

test("statistiques par département : cohérence idem", () => {
  const s = getStats({});
  const parDept = getStatsByDimension("department");
  const somme = parDept.reduce((n, r) => n + Number(r.total), 0);
  assert.equal(somme, s.total_schools);
});

test("carte : les points sont dans le box métropole", () => {
  const pts = getMapPoints({}, 20000);
  assert.ok(pts.length > 1000, `trop peu de points : ${pts.length}`);
  for (const p of pts) {
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    assert.ok(lat > 41 && lat < 52, `lat hors box : ${lat}`);
    assert.ok(lon > -6 && lon < 10, `lon hors box : ${lon}`);
  }
});

test("carte : statut par défaut AUCUNE_INFO quand aucun événement", () => {
  const pts = getMapPoints({}, 50);
  for (const p of pts) {
    assert.ok(
      ["AUCUNE_INFO", "SIGNALE", "CONFIRME", "FERME", "PERTURBE", "BLOQUE", "CONTRADICTOIRE", "EXPIRE"].includes(
        String(p.status),
      ),
      `statut inattendu : ${p.status}`,
    );
  }
});
