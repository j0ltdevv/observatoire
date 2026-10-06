/**
 * Vérifie l'import contre le dataset officiel.
 * Tout chiffre affiché doit être reproductible : ce script est le contrôle.
 *   node scripts/verify-import.ts
 */

import { getDb } from "../lib/db/index.ts";

const db = getDb();
const one = (sql: string): Record<string, unknown> =>
  db.prepare(sql).get() as Record<string, unknown>;

console.log("— Intégrité de l'import —");
console.log("établissements        ", one("SELECT COUNT(*) n FROM schools").n);
console.log("lycées (nature LYCEE) ", one("SELECT COUNT(*) n FROM schools WHERE school_type LIKE 'LYCEE%'").n);
console.log("dont LEGT             ", one("SELECT COUNT(*) n FROM schools WHERE school_type = 'LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE'").n);
console.log("dont LP               ", one("SELECT COUNT(*) n FROM schools WHERE school_type = 'LYCEE PROFESSIONNEL'").n);

console.log("\n— Périmètre : la carte du MVP = métropole (PRD §18) —");
for (const r of db
  .prepare(
    `SELECT scope,
            COUNT(*) n,
            SUM(CASE WHEN school_type LIKE 'LYCEE%' THEN 1 ELSE 0 END) lycees
     FROM schools GROUP BY scope ORDER BY scope`,
  )
  .all() as Array<{ scope: string; n: number; lycees: number }>) {
  console.log(`  ${r.scope.padEnd(12)} ${String(r.n).padStart(6)} établissements, ${r.lycees} lycées`);
}
console.log("  outre-mer marked but never deleted : filtrage à l'affichage, pas à l'import.");
console.log("sans coordonnées      ", one("SELECT COUNT(*) n FROM schools WHERE latitude IS NULL OR longitude IS NULL").n);
console.log("UAI dupliqués         ", one("SELECT COUNT(*) n FROM (SELECT uai FROM schools GROUP BY uai HAVING COUNT(*) > 1)").n);
console.log("départements          ", one("SELECT COUNT(DISTINCT department_code) n FROM schools").n);
console.log("régions               ", one("SELECT COUNT(DISTINCT region_code) n FROM schools").n);
console.log("académies             ", one("SELECT COUNT(DISTINCT academy_code) n FROM schools").n);

console.log("\n— Bornes géographiques (France métropolitaine + DOM attendu) —");
const bbox = one(
  `SELECT MIN(latitude) minlat, MAX(latitude) maxlat,
          MIN(longitude) minlon, MAX(longitude) maxlon FROM schools`,
) as Record<string, number>;
console.log("lat", bbox.minlat?.toFixed(3), "→", bbox.maxlat?.toFixed(3));
console.log("lon", bbox.minlon?.toFixed(3), "→", bbox.maxlon?.toFixed(3));
const outOfBounds = one(
  `SELECT COUNT(*) n FROM schools
   WHERE latitude < 41 OR latitude > 52 OR longitude < -6 OR longitude > 10`,
).n;
console.log("hors box FR          ", outOfBounds, outOfBounds === 0 ? "(OK)" : "(à examiner)");

console.log("\n— Le cas de test du PRD §34 —");
const moulin = db
  .prepare(
    `SELECT uai, name, city, academy_name FROM schools
     WHERE name LIKE '%Jean Moulin%' AND city LIKE '%Bordeaux%'`,
  )
  .all() as Array<{ uai: string; name: string; city: string; academy_name: string }>;
if (moulin.length === 0) {
  console.log('"Lycée Jean Moulin, Bordeaux" → 0 correspondance');
} else if (moulin.length === 1) {
  console.log(`"Lycée Jean Moulin, Bordeaux" → 1 correspondance : UAI ${moulin[0].uai} (${moulin[0].name})`);
} else {
  console.log(`"Lycée Jean Moulin, Bordeaux" → ${moulin.length} correspondances : matching AUTOMATIQUE INTERDIT`);
  for (const m of moulin) console.log(`   ${m.uai}  ${m.name} — ${m.city}`);
}

console.log("\n— Statuts : le vide est assumé (PRD §4.5) —");
console.log("événements           ", one("SELECT COUNT(*) n FROM mobilization_events").n);
console.log("établissements suivis", one("SELECT COUNT(*) n FROM school_current").n);
console.log("'aucune information' ≠ 'aucune mobilisation' : rien n'est déduit de ce vide.");
