/**
 * Tests de la classification déterministe (PRD §4.4, §7, §15).
 * Run : node --test tests/classify.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, factSentence } from "../lib/classify.ts";

test("fermeture annoncée", () => {
  const r = classify("Le lycée Jean Moulin à Bordeaux est fermé ce mardi.");
  assert.equal(r.status, "FERME");
  assert.ok(r.matched);
});

test("blocage explicite → BLOQUE, pas FERME", () => {
  const r = classify("Le lycée Voltaire est bloqué depuis 7 h.");
  assert.equal(r.status, "BLOQUE");
});

test("« perturbation » seule ne devient jamais BLOQUE", () => {
  const r = classify("Le lycée Montesquieu est perturbé par une grève.");
  assert.equal(r.status, "PERTURBE");
  assert.notEqual(r.status, "BLOQUE");
});

test("§4.4 — cours suspendus = PERTURBE, fait descriptif", () => {
  const r = classify("Au lycée Fabert, les cours sont suspendus depuis 8 h.");
  assert.equal(r.status, "PERTURBE");
  assert.ok(r.is_fact_about_school);
});

test("mobilisation seule = SIGNALÉ, pas « fortement mobilisé »", () => {
  const r = classify("Mobilisation des élèves devant le lycée Condorcet.");
  assert.equal(r.status, "SIGNALE");
});

test("texte thématique sans établissement : rien n'est rattaché", () => {
  const r = classify(
    "Des dizaines de milliers de lycéens attendus dans la rue partout en France.",
  );
  assert.equal(r.is_fact_about_school, false);
  assert.equal(r.uai, null);
});

test("statut générique sans nom d'établissement : rattachement refusé", () => {
  // « dans plusieurs lycées » ne désigne aucun UAI : on ne rattache rien.
  const r = classify("Les cours sont suspendus dans plusieurs lycées de la région.");
  assert.equal(r.status, "PERTURBE");
  assert.equal(r.is_fact_about_school, false);
  assert.match(r.notes.join(" "), /ne nomme aucun établissement/);
});

test("UAI explicite est extrait", () => {
  const r = classify("Selon la mairie, le lycée (UAI 0330026Z) est fermé.");
  assert.equal(r.uai, "0330026Z");
  assert.equal(r.status, "FERME");
});

test("§7 — « entrée bloquée » ne vaut pas « lycée bloqué »… mais reste un fait", () => {
  const r = classify("L'entrée du lycée a été bloquée par les élèves.");
  assert.equal(r.status, "BLOQUE");
  assert.ok(r.matched?.toLowerCase().includes("bloqu"));
});

test("aucun statut sans motif : null, jamais un défaut", () => {
  const r = classify("Le conseil municipal s'est réuni mardi soir.");
  assert.equal(r.status, null);
  assert.match(r.notes.join(" "), /Aucun motif/);
});

test("§4.4 — la description affichée est la phrase source, pas un jugement", () => {
  const phrase =
    "Le lycée Arthur Rimbaud est bloqué. Aucun élève ne serait sorti.";
  const d = factSentence(phrase);
  assert.ok(d.includes("bloqué"));
  assert.ok(!/fortement|évidemment|impact/i.test(d), "pas d'interprétation ajoutée");
});

test("la classification est toujours de confiance D avant validation humaine", () => {
  for (const t of ["lycée fermé", "élèves mobilisés", "rien"]) {
    assert.equal(classify(t).confidence, "D");
  }
});

test("déterminisme : deux exécutions, même résultat", () => {
  const t = "Le lycée Jules Ferry à Marseille est perturbé.";
  assert.deepEqual(classify(t), classify(t));
});
