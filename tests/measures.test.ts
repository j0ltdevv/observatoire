/**
 * Tests des mesures institutionnelles — LECTURE SEULE sur la base réelle.
 *
 * Aucun fixture ici : la base contient l'arrêté préfectoral réellement importé,
 * et les tests vérifient le croisement tel qu'un visiteur le voit. Tout ce qui
 * écrit vit dans tests/measures-write.test.ts, sur une base jetable.
 *
 * Le test central est « une interdiction de rassemblement ne produit aucun
 * statut » : c'est la règle la plus facile à enfreindre par inadvertance, et
 * celle qui ferait passer le registre pour un décompte de blocages.
 *
 * Run : node --test tests/measures.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../lib/db/index.ts";
import { crossCheck, listMeasures } from "../lib/measures.ts";

/** L'arrêté du 5 octobre 2026, désigné explicitement. */
function arreteGrandParis() {
  const m = listMeasures().find(
    (x) => x.measure_type === "INTERDICTION_RASSEMBLEMENT" && x.reference_date === "2026-10-05",
  );
  assert.ok(m, "l'arrêté préfectoral du 5 octobre doit être importé");
  return m;
}

test("l'arrêté préfectoral du 5 octobre est enregistré comme MESURE, pas comme statut", () => {
  const m = arreteGrandParis();
  const db = getDb();

  const entries = db
    .prepare("SELECT COUNT(*) n FROM measure_entries WHERE measure_id = @id")
    .get({ id: m.id }) as { n: number };
  assert.ok(
    Number(entries.n) > 50,
    `la liste publiée doit être non vide, obtenue ${entries.n}`,
  );

  // Le point crucial : ces établissements sont dans une table de mesures.
  // Aucun ne doit en sortir un statut de mobilisation.
  const fautifs = db
    .prepare(
      `SELECT s.uai, s.name, c.status
         FROM measure_entries me
         JOIN schools s ON s.id = me.school_id
         JOIN school_current c ON c.school_id = me.school_id
        WHERE me.measure_id = @id
          AND c.status IN ('FERME', 'BLOQUE', 'PERTURBE', 'CONFIRME')
        LIMIT 5`,
    )
    .all({ id: m.id }) as Array<{ uai: string; name: string; status: string }>;

  assert.equal(
    fautifs.length,
    0,
    fautifs
      .map((r) => `${r.uai} (${r.name}) en ${r.status}`)
      .join(" ; ") +
      " : un arrêté d'interdiction ne peut pas produire un statut de fermeture",
  );
});

test("le croisement mesure ↔ registre est arithmétiquement juste", () => {
  const m = arreteGrandParis();
  const x = crossCheck(m.id);
  assert.ok(x.entries_total > 0);
  assert.ok(x.entries_matched <= x.entries_total);
  assert.ok(x.entries_with_event <= x.entries_matched);
  assert.equal(
    x.entries_without_event,
    x.entries_matched - x.entries_with_event,
    "les deux moitiés se complètent",
  );
  assert.equal(x.sans_info.length, x.entries_without_event);
});

test("le nombre annoncé par la source et le nombre de lignes listées peuvent différer", () => {
  // France 3 annonce « près de 86 lycées » et en liste 105 : les deux
  // nombres sont conservés séparément. Les aligner serait choisir un chiffre.
  const m = arreteGrandParis();
  assert.equal(m.announced_count, 86);
  const x = crossCheck(m.id);
  assert.equal(x.entries_total, 105);
  assert.notEqual(m.announced_count, x.entries_total);
});

test("un établissement nommé par l'acte mais sans événement reste AUCUNE_INFO", () => {
  const m = arreteGrandParis();
  const x = crossCheck(m.id);
  assert.ok(x.sans_info.length > 0, "l'acte nomme des établissements non documentés");

  const db = getDb();
  for (const s of x.sans_info.slice(0, 10)) {
    const st = db
      .prepare(
        "SELECT status FROM school_current WHERE school_id = (SELECT id FROM schools WHERE uai = @uai)",
      )
      .get({ uai: s.uai }) as { status: string | null } | undefined;
    assert.ok(
      !st?.status || st.status === "AUCUNE_INFO",
      `${s.uai} (${s.name}) est ${st?.status} alors que l'acte ne dit rien sur son fonctionnement`,
    );
  }
});

test("le nombre « documentés au registre » est honnête : il peut être minuscule", () => {
  const m = arreteGrandParis();
  const x = crossCheck(m.id);
  assert.ok(
    x.entries_with_event < x.entries_matched,
    "l'acte nomme des établissements que le registre ne documente pas — c'est le but",
  );
});
