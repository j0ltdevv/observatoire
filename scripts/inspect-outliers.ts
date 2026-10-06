/**
 * Les 2 518 points hors box métropole ne sont pas forcément des erreurs :
 * on casse par code postal et par ministère pour le prouver.
 *   node scripts/inspect-outliers.ts
 */

import { getDb } from "../lib/db/index.ts";

const db = getDb();
const all = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>;

console.log("— Hors box métropole, par code postal (3 chiffres) —");
for (const r of all(`
  SELECT substr(postal_code,1,3) cp, COUNT(*) n,
         MIN(latitude) minlat, MAX(latitude) maxlat,
         MIN(longitude) minlon, MAX(longitude) maxlon
  FROM schools
  WHERE latitude < 41 OR latitude > 52 OR longitude < -6 OR longitude > 10
  GROUP BY cp ORDER BY n DESC
`)) {
  console.log(
    `  ${String(r.cp).padEnd(4)} ${String(r.n).padStart(5)}  ` +
      `lat ${Number(r.minlat).toFixed(1)}→${Number(r.maxlat).toFixed(1)}  ` +
      `lon ${Number(r.minlon).toFixed(1)}→${Number(r.maxlon).toFixed(1)}`,
  );
}

console.log("\n— Code ministère (06 = Éducation nationale, 032/033 = outre-mer) —");
for (const r of all(`
  SELECT postal_code LIKE '03%' AS outremer, COUNT(*) n
  FROM schools
  WHERE latitude < 41 OR latitude > 52 OR longitude < -6 OR longitude > 10
  GROUP BY outremer
`)) {
  console.log(`  outre-mer=${r.outremer} : ${r.n}`);
}

console.log("\n— Métropole : vraiment 0 hors box ? —");
const metro = one("SELECT COUNT(*) n FROM schools WHERE postal_code NOT LIKE '97%' AND postal_code NOT LIKE '98%' AND postal_code NOT LIKE '03%' AND (latitude < 41 OR latitude > 52 OR longitude < -6 OR longitude > 10)");
console.log("  points métropole hors box :", metro.n);

console.log("\n— Le matching du PRD : que vaut vraiment la chaîne ? —");
for (const term of ["Jean Moulin", "Moulin"]) {
  const rows = all(`SELECT uai, name, city, school_type FROM schools WHERE name LIKE ? LIMIT 5`, );
  void rows;
  const found = db
    .prepare(`SELECT uai, name, city FROM schools WHERE name LIKE ? ORDER BY name LIMIT 6`)
    .all(`%${term}%`) as Array<{ uai: string; name: string; city: string }>;
  console.log(`  "${term}" → ${found.length ? "" : "aucun"}`);
  for (const f of found) console.log(`     ${f.uai}  ${f.name} — ${f.city}`);
}

console.log("\n— Les lycées de Bordeaux (test de référence PRD) —");
for (const r of all(`
  SELECT uai, name FROM schools
  WHERE city LIKE 'Bordeaux%' AND school_type LIKE 'LYCEE%' ORDER BY name LIMIT 8
`)) {
  console.log(`  ${r.uai}  ${r.name}`);
}

function one(sql: string): Record<string, unknown> {
  return db.prepare(sql).get() as Record<string, unknown>;
}
