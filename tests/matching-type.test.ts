/**
 * Le filtre par ordre d'enseignement — sans lui, un lycée matche une école
 * élémentaire de la même rue et le registre publie une école primaire
 * « fermée ».
 *
 * Run : node --test tests/matching-type.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSchool } from "../lib/matching.ts";

test("« lycée Chaptal » (Paris) ne tombe jamais sur l'école de la rue Chaptal", () => {
  const sansFiltre = matchSchool({ name: "Chaptal", city: "Paris" });
  const avecFiltre = matchSchool({ name: "Chaptal", city: "Paris", etab_kind: "lycee" });

  assert.ok(avecFiltre.uai, "le lycée doit être trouvé");
  const ecole = avecFiltre.candidates[0];
  assert.ok(
    ecole.school_type.startsWith("LYCEE"),
    `type inattendu : ${ecole.school_type} — ${ecole.name}`,
  );
  // Le piège doit exister : sans filtre, une école élémentaire est candidate.
  assert.ok(
    sansFiltre.candidates.some((c) => c.name.includes("E.P.PU")),
    "l'école élémentaire doit apparaître parmi les candidats non filtrés",
  );
});

test("« lycée Martin Nadaud » (Paris) ne tombe pas sur sa section d'enseignement", () => {
  const r = matchSchool({ name: "Martin-Nadaud", city: "Paris", etab_kind: "lycee" });
  assert.equal(r.uai, "0754530S");
  assert.ok(r.candidates[0].school_type.startsWith("LYCEE"));
  assert.ok(
    !r.candidates[0].school_type.startsWith("SECTION"),
    "une section n'est pas un établissement autonome",
  );
});

test("« lycée Henri Bergson » lève l'ambiguïté avec le collège du même nom", () => {
  const college = matchSchool({ name: "Henri-Bergson", city: "Paris", etab_kind: "college" });
  const lycee = matchSchool({ name: "Henri-Bergson", city: "Paris", etab_kind: "lycee" });
  assert.equal(college.candidates[0]?.school_type, "COLLEGE");
  assert.ok(lycee.candidates[0]?.school_type.startsWith("LYCEE"));
});

test("le filtre ne masque pas une absence : un collège inexistant reste introuvable", () => {
  const r = matchSchool({
    name: "Chaptal",
    city: "Paris",
    etab_kind: "college",
  });
  assert.ok(
    r.uai === null || r.candidates[0].school_type === "COLLEGE",
    "aucun UAI de collège ne doit être produit",
  );
});

test("sans indication de type, l'ambiguïté est maintenue", () => {
  const r = matchSchool({ name: "Chaptal", city: "Paris" });
  assert.ok(["ambiguous", "too_weak", "name_and_city", "fuzzy"].includes(r.kind));
});
