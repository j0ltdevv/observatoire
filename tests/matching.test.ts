/**
 * Tests du rattachement UAI (PRD §13, §34).
 * Run : node --test tests/matching.test.ts
 *
 * Ces tests utilisent le VRAI dataset importé : un cas qui passe en base
 * réelle ne passera pas forcément sur une base vide, et inversement.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSchool, normalize, nameTokens, byExplicitUai } from "../lib/matching.ts";

test("normalisation : accents, casse, ponctuation", () => {
  assert.equal(normalize("Lycée Général François Magendie"), "lycee general francois magendie");
  assert.equal(normalize("SAINT-ETIENNE"), "saint etienne");
  assert.equal(normalize("  Châtillon-sur-Chalaronne  "), "chatillon sur chalaronne");
});

test("tokens de nom : les mots génériques ne discriminent pas", () => {
  const t = nameTokens("Lycée Jean Moulin");
  assert.ok(t.includes("jean") && t.includes("moulin"));
  assert.ok(!t.includes("lycee"), "« lycée » ne doit pas être un token discriminant");
});

test("§13 — priorité 1 : l'UAI cité explicitement gagne tout", () => {
  const r = byExplicitUai("selon la mairie de 0330026Z, le lycée est fermé");
  assert.ok(r, "l'UAI explicite doit être détecté");
  assert.equal(r?.kind, "exact_uai");
  assert.equal(r?.uai, "0330026Z");
  assert.equal(r?.confidence, "A");
});

test("§13 — priorité 1 : UAI inconnu = aucune invention", () => {
  const r = byExplicitUai("UAI 9999999X cité");
  assert.equal(r?.kind, "none");
  assert.equal(r?.uai, null);
  assert.match(r?.reason ?? "", /absent du dataset/);
});

test("§34 — deux UAI dans la même phrase = ambiguïté, pas de tirage au sort", () => {
  const r = byExplicitUai("les lycées 0330026Z et 0330021U sont concernés");
  assert.equal(r?.kind, "ambiguous");
  assert.equal(r?.uai, null);
});

test("nom + ville : correspondance exacte -> confiance A", () => {
  const r = matchSchool({ name: "Lycée général François Magendie", city: "Bordeaux" });
  assert.equal(r.kind, "name_and_city");
  assert.equal(r.uai, "0330026Z");
  assert.equal(r.confidence, "A");
});

test("nom + ville insensibles aux accents et à la casse", () => {
  const r = matchSchool({ name: "lycée général françois magendie", city: "BORDEAUX" });
  assert.equal(r.uai, "0330026Z");
});

test("le cas du PRD : « Lycée Jean Moulin, Bordeaux » ne force aucune correspondance", () => {
  // Le PRD §34 donne ce test comme exemple. Il n'existe aucun lycée de ce nom à
  // Bordeaux. Le système ne doit ni inventer, ni se rabattre sur un autre
  // établissement qui partage un prénom courant (« Jean »).
  const r = matchSchool({ name: "Lycée Jean Moulin", city: "Bordeaux" });
  assert.equal(r.uai, null, "aucun UAI ne doit être proposé");
  assert.ok(["ambiguous", "too_weak", "none"].includes(r.kind), `kind inattendu : ${r.kind}`);
  assert.match(r.reason, /ambigu|faible|validation|obligatoire/i);
});

test("« Jean Moulin » sans commune : ambiguïté assumée", () => {
  const r = matchSchool({ name: "Lycée Jean Moulin" });
  assert.equal(r.uai, null);
  assert.equal(r.kind, "ambiguous");
  assert.ok(r.candidates.length > 1, "plusieurs Jean Moulin doivent être proposés");
  assert.match(r.reason, /commune est obligatoire/i);
});

test("à Albertville, « Jean Moulin » est ambigu : lycée ET collège", () => {
  const r = matchSchool({ name: "Lycée Jean Moulin", city: "Albertville" });
  assert.equal(r.uai, null, "le choix lycée/collège doit rester humain");
  assert.equal(r.kind, "ambiguous");
});

test("nom sans rapport : aucun UAI proposé, même si un mot coïncide", () => {
  // « Toulouse » matche « Lycée professionnel Toulouse-Lautrec » à Bordeaux :
  // 1 mot sur 3. Proposer cet UAI serait une invention.
  const r = matchSchool({ name: "Lycée Imaginaire Zorglub Toulouse", city: "Bordeaux" });
  assert.equal(r.uai, null, "aucun UAI sous le seuil");
  assert.equal(r.kind, "too_weak");
  assert.match(r.reason, /trop faible/);
});

test("aucun mot en commun : aucune piste", () => {
  const r = matchSchool({ name: "Lycée Imaginaire Zorglub Fenouillard", city: "Bordeaux" });
  assert.equal(r.uai, null);
  assert.equal(r.kind, "none");
  assert.match(r.reason, /ne correspond à aucun/);
});

test("§34 — jamais de création automatique d'établissement", () => {
  const noms = [
    { name: "Lycée Qui Nexiste Pas", city: "Paris" },
    { name: "", city: "Paris" },
    { name: "École", city: "" },
    { name: "Lycée", city: "Bordeaux" },
  ];
  for (const input of noms) {
    const r = matchSchool(input);
    assert.ok(r.uai === null || /^\d{7}[A-Z]$/.test(r.uai), "UAI invérifiable");
    if (r.uai === null) assert.match(r.reason, /Aucun|ambigu|validation|obligatoire/i);
  }
});

test("toute correspondance est motivée", () => {
  const cas = [
    { name: "Lycée général Michel Montaigne", city: "Bordeaux" },
    { name: "Jean Moulin", city: "Albertville" },
    { text: "UAI 0332868N" },
  ];
  for (const c of cas) {
    const r = matchSchool(c);
    if (r.uai) {
      assert.ok(r.reason.length > 10, `raison trop vague : ${r.reason}`);
      assert.ok(r.confidence, "confiance manquante");
    }
  }
});

test("correspondance partielle : confiance dégradée, jamais A", () => {
  const r = matchSchool({ name: "Magendie", city: "Bordeaux" });
  if (r.uai) {
    assert.notEqual(r.confidence, "A");
    assert.match(r.reason, /partielle|exactement/);
  }
});
