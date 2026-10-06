/**
 * Les formulations que la presse utilise réellement pour un blocus. Elles ont
 * été ajoutées après coup sur des phrases trouvées en production : chacune
 * avait d'abord silently renvoyé « aucun statut ».
 *
 * Run : node --test tests/classify-blocus.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../lib/classify.ts";

const BLOQUES = [
  "Blocus au lycée Jules-Ferry de Paris, le 2 octobre 2026.",
  "Blocus au lycée Louis-Lapicque d'Épinal, le 1er octobre 2026.",
  "Blocage du Lycée Philibert Dessaignes de Blois, le 1er octobre 2026.",
  "À Perpignan, dès le matin, les lycées Arago, Jean-Lurçat, Maillol et Picasso sont bloqués.",
  "À Brest, la majorité des lycées sont bloqués.",
  "À Marseille, dix-huit lycées sont totalement bloqués et trois partiellement dans la matinée.",
];

for (const [i, phrase] of BLOQUES.entries()) {
  test(`formulation réelle n°${i + 1} → BLOQUE : « ${phrase.slice(0, 48)}… »`, () => {
    const r = classify(phrase);
    assert.equal(r.status, "BLOQUE", `motif non reconnu, matched=${r.matched}`);
    assert.ok(r.matched);
  });
}

test("« blocus » sans « e » est reconnu : la presse n'écrit pas « blocages » partout", () => {
  // Régression : `blocages?` ne matchait pas « blocus », la forme la plus
  // courante dans les légendes de photos.
  assert.equal(classify("Blocus au lycée Test de Ville").status, "BLOQUE");
});

test("rassemblement au participe passé + lieu après : SIGNALÉ", () => {
  const r = classify(
    "Le 1er octobre 2026, à Troyes, une voiture de police est filmée au milieu de " +
      "lycéens rassemblés près du lycée Marie-de-Champagne.",
  );
  assert.equal(r.status, "SIGNALE");
  assert.ok(r.is_fact_about_school);
});

test("un incendie n'est PAS un statut de mobilisation", () => {
  // §4.4 : le registre ne note que l'état de fonctionnement de l'établissement.
  // Une dégradation n'est ni FERME ni BLOQUE ni PERTURBE.
  for (const phrase of [
    "À Nantes, le hall du lycée Nelson-Mandela est détruit par un incendie.",
    "Un bus est également incendié devant le lycée La Floride.",
    "Un élève du lycée Auguste-Béhal est grièvement blessé par l'explosion d'une grenade.",
  ]) {
    const r = classify(phrase);
    assert.notEqual(r.status, "FERME", phrase);
    assert.notEqual(r.status, "BLOQUE", phrase);
    assert.notEqual(r.status, "PERTURBE", phrase);
  }
});

test("une réouverture partielle n'est pas un statut non plus", () => {
  assert.equal(
    classify(
      "En visite au lycée de Villaroy à Guyancourt, le ministre indique que certains " +
        "établissements ont rouvert partiellement pour certains niveaux.",
    ).status,
    null,
  );
});
