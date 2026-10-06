/**
 * Importe l'arrêté préfectoral du 5 octobre 2026 (Grand Paris) et le croise
 * avec le registre.
 *
 *   node scripts/import-measures.ts
 *
 * Rappel méthodologique : cet arrêté INTERDIT LES RASSEMBLEMENTS. Il ne
 * ferme aucun établissement. Aucun statut n'est créé ici — la mesure est
 * enregistrée comme mesure, et le croisement montre ce que le registre sait
 * et ce qu'il ne sait pas.
 */

import { upsertSource } from "../lib/ingest.ts";
import { get, getDb } from "../lib/db/index.ts";
import {
  crossCheck,
  insertEntries,
  insertMeasure,
  listMeasures,
  MEASURE_LABELS,
} from "../lib/measures.ts";

const URL =
  "https://france3-regions.franceinfo.fr/paris-ile-de-france/des-prefectures-interdisent-les-rassemblements-devant-certains-lycees-franciliens-la-liste-des-etablissements-concernes-3427974.html";

/**
 * Liste reproduite telle que publiée. Le décompte de l'article est « près de
 * 86 lycées du Grand Paris, dont 25 à Paris intra-muros » ; la liste publiée
 * en énumère davantage, dont des communes hors Grand Paris (Oise). On
 * enregistre le nombre ANNONCÉ (86) et on compte les lignes réelles séparément.
 */
const BRUT = [
  "Arago, 12e", "Louis Armand, 15e", "Gaston Bachelard, 13e", "Balzac, 16e",
  "Beaugrenelle, 15e", "Hélène Boucher, 20e", "Colbert, 10e", "d’Alembert, 19e",
  "Étienne Dolet, 20e", "Caroline Dorian, 11e", "Gustave Eiffel, 7e",
  "Gabriel Fauré, 13e", "Galilée, 13e", "Hector Guimard, 19e",
  "Marie Laurencin, 10e", "Elisa Lemonnier, 12e", "Pierre Lescot, 1er",
  "Jean Lurçat, 13e", "Martin Nadaud, 20e", "Racine, 8e", "Raspail, 14e",
  "Maurice Ravel, 20e", "Turquetil, 11e", "Roger Verlomme, 15e", "Voltaire, 11e",
  "Théodore Monod à Antony", "Auffray à Clichy-la-Garenne",
  "Newton à Clichy-la-Garenne", "de l’Observatoire à Meudon",
  "Gustave Eiffel à Rueil-Malmaison",
  "Jean-Pierre Timbaud (Aubervilliers)", "Le Corbusier (Aubervilliers)",
  "Voillaume (Aulnay-sous-Bois)", "Eugène Henaff (Bagnolet)",
  "Léo Lagrange (Bondy)", "Jean Renoir (Bondy)", "Paul le Rolland (Drancy)",
  "Eugène Delacroix (Drancy)", "Gustave Eiffel (Gagny)",
  "Denis Papin (La Courneuve)", "Albert Schweitzer (Le Raincy)",
  "René Cassin (Le Raincy)", "Claude-Nicolas Ledoux (Les Pavillons-sous-Bois)",
  "Condorcet (Montreuil)", "Eugénie Cotton (Montreuil)", "Jean Jaurès (Montreuil)",
  "Théodore Monod (Noisy-le-Sec)", "Olympe de Gouge (Noisy-le-Sec)",
  "Marcelin Berthelot (Pantin)", "Lucie Aubrac (Pantin)",
  "Paul Eluard (Saint-Denis)", "Suger (Saint-Denis)",
  "Frédéric Bartholdi (Saint-Denis)", "Hélène Boucher (Tremblay-en-France)",
  "Léonard de Vinci (Tremblay-en-France)", "Georges Clémenceau (Villemomble)",
  "Jean Rostand (Villepinte)", "Georges Brassens (Villepinte)",
  "Maximilien Perret d’Alfortville", "Robert Schuman de Charenton-le-Pont",
  "Romain Rolland d’Ivry", "Darius Milhaud du Kremlin-Bicêtre",
  "Guillaume Budé de Limeil-Brévannes", "Louis Armand de Nogent-sur-Marne",
  "Condorcet de Saint-Maur-des-Fossés", "François Mansart de Saint-Maur-des-Fossés",
  "Christophe Colomb de Sucy-en-Brie",
  "François Arago de Villeneuve-Saint-Georges",
  "professionnel Camille Claudel de Vitry-sur-Seine",
  "Jean Macé de Vitry-sur-Seine", "Adolphe Chérioux de Vitry-sur-Seine",
  "d’enseignement général et technologique Pierre Mendes-France, Savigny-le-Temple",
  "polyvalent, René Descartes, Champs-sur-Marne",
  "d’enseignement général et technologique Gaston Bachelard, Chelles",
  "professionnel Benjamin Franklin, La Rochette",
  "professionnel Jacques Prévert, Combs La Ville",
  "polyvalent De Le Mare Carrée, Moissy Cramayel",
  "d’enseignement général et technologique Henri Moissan, Meaux",
  "polyvalent Pierre De Coubertin, Meaux",
  "d’enseignement général et technologique Van Dongen, Lagny Sur Marne",
  "d’enseignement général et technologique Jean Vilar, Meaux",
  "polyvalent Blaise Pascal, Brie Comte Robert",
  "polyvalent Antonin Careme, Savigny le Temple",
  "George Sand, le Mee-sur-Seine", "Martin Luther King, Bussy-Saint-Georges",
  "Louis Lumière, Chelles", "Jehan de Chelles, Chelles", "Jacques Amyot, Melun",
  "Simone Veil, Noisiel", "Joliot Curie, Dammarie-Les-Lys",
  "Simone Signoret, Vaux-Le-Penil", "Corneille, La Celle-Saint-Cloud",
  "Lucien René Duchesne, La Celle Saint Cloud",
  "Jean Moulin, Chesnay-Rocquencourt", "Léopold Sédar Senghor, Magnanville",
  "Saint Exupéry, Mantes-la-Jolie", "Le Corbusier, Poissy", "Condorcet, Limay",
  "Jules Ferry, Versailles", "Jacques Prévert, Versailles",
  "Émilie de Breteuil, Montigny-le-Bretonneux", "Jules Uhry, Creil",
  "Marie Curie, Nogent-sur-Oise", "Mireille Grenet, Compiègne",
  "Cassini, Clermont-de-l’Oise",
];

/**
 * Découpe les trois formes de la liste :
 *   « Arago, 12e »                      → Paris, 12e
 *   « Théodore Monod à Antony »         → Antony
 *   « Jean-Pierre Timbaud (Aubervilliers) » → Aubervilliers
 *   « professionnel Camille Claudel de Vitry-sur-Seine » → descripteur à retirer
 */
const DESCRIPTEURS =
  /^(?:professionnel|polyvalent|d’enseignement général et technologique|d’enseignement professionnel|sections?)\s*,?\s*/i;

function parse(raw: string): { name: string; city: string | null; arr: string | null } {
  let s = raw.trim().replace(/^(?:lycée|lycee|collège)\s+/i, "");
  s = s.replace(DESCRIPTEURS, "");

  // « X (Ville) »
  let m = s.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (m) return { name: m[1].trim(), city: m[2].trim(), arr: null };

  // « X à Ville »
  m = s.match(/^(.+?)\s+à\s+(.+)$/);
  if (m) return { name: m[1].trim(), city: m[2].trim(), arr: null };

  // « X, Ville » ou « X, 12e »
  m = s.match(/^(.+?),\s*(.+)$/);
  if (m) {
    const queue = m[2].trim();
    if (/^\d{1,2}e$/.test(queue)) {
      return { name: m[1].trim(), city: "Paris", arr: queue };
    }
    return { name: m[1].trim(), city: queue, arr: null };
  }

  return { name: s, city: null, arr: null };
}

const source = upsertSource({
  url: URL,
  title:
    "Des préfectures interdisent les rassemblements devant certains lycées franciliens, " +
    "la liste des établissements concernés",
  publisher: "France 3 Île-de-France (relaye les arrêtés préfectoraux)",
  source_type: "national_media",
  published_at: "2026-10-05T00:00:00Z",
  text: BRUT.join("\n"),
});

const AUTHORITY =
  "Préfetures de Paris, de la Seine-Saint-Denis, du Val-de-Marne et des Hauts-de-Seine";
const TYPE = "INTERDICTION_RASSEMBLEMENT";
const DATE = "2026-10-05";

/**
 * Idempotent : la source peut déjà exister (déduplication §26) sans que la
 * mesure ait été créée, et l'inverse est vrai aussi. On cherche donc la
 * mesure, pas la source.
 */
const existante = get<{ id: number }>(
  getDb(),
  `SELECT im.id FROM institutional_measures im
    WHERE im.source_id = @source_id AND im.reference_date = @date AND im.measure_type = @type`,
  { source_id: source.id, date: DATE, type: TYPE },
);

if (existante) {
  console.log(`Mesure déjà présente (#${existante.id}) — rien à refaire.`);
} else {
  const measureId = insertMeasure({
    source_id: source.id,
    authority: AUTHORITY,
    measure_type: TYPE,
    scope: "Grand Paris (dépassant sur l'Oise et la Seine-et-Marne)",
    reference_date: DATE,
    announced_count: 86,
  });

  // Le rattachement est fait par insertEntries : la liste est passée telle
  // quelle, avec le nom brut et la commune telle que publiée.
  const entries = BRUT.map((raw) => {
    const p = parse(raw);
    // `raw_name` est affiché tel que publié ; `name` sert au rattachement.
    return { raw_name: raw, name: p.name, city: p.city, arrondissement: p.arr };
  });

  const r = insertEntries(measureId, entries);
  console.log(
    `Mesure enregistrée (#${measureId}) : ${r.inserees} établissements nommés par l'arrêté, ` +
      `${r.rattachees} rattachés à un UAI.`,
  );
}

const last = listMeasures().find((m) => m.reference_date === DATE);
if (!last) {
  console.error("Aucune mesure importée.");
  process.exit(1);
}
const x = crossCheck(last.id);

console.log(`\n${last.authority}`);
console.log(`${MEASURE_LABELS[last.measure_type]} — ${last.reference_date}`);
console.log(`Nombre annoncé par la source : ${last.announced_count}`);
console.log(`Lignes effectivement listées : ${x.entries_total}\n`);

console.log(`Rattachés à un UAI          : ${x.entries_matched}/${x.entries_total}`);
console.log(`Dont documentés au registre : ${x.entries_with_event}`);
console.log(`Nommés par l'acte, sans info au registre : ${x.entries_without_event}`);

console.log(
  "\nAUCUN statut n'a été créé à partir de cet arrêté. Une interdiction de",
);
console.log("rassemblement n'est pas une fermeture : le dériver serait inventer un fait.");

const echantillon = x.sans_info.slice(0, 6);
if (echantillon.length) {
  console.log("\nÉchantillon des établissements nommés mais sans information :");
  for (const s of echantillon) console.log(`  ${s.uai}  ${s.name} — ${s.city}`);
}
