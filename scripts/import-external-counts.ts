/**
 * Enregistre les décomptes publiés par d'autres acteurs (PRD §17).
 *
 *   node scripts/import-external-counts.ts
 *
 * Chaque chiffre est recopié TEL QU'IL EST PUBLIÉ, avec la formulation
 * d'origine (« plus de 400 », « près de 30 % ») : arrondir un chiffre
 * approximatif en nombre exact serait une falsification. La colonne
 * `figure` ne porte l'entier que si la source publie un entier.
 */

import { addExternalCount, listExternalCounts, ourOwnCount } from "../lib/external-counts.ts";

const SRC =
  "https://www.sortiraparis.com/actualites/a-paris/articles/353296-manifestation-etudiante-du-6-octobre-quels-lycees-et-universites-mobilises-a-paris-et-en-ile-de-france";

const COMPTES = [
  {
    publisher: "Ministère de l'Éducation nationale",
    figure: null,
    figure_text: "plus de 400 établissements scolaires fermés",
    definition:
      "Fermetures d'établissements scolaires, tous ordres confondus. " +
      "Le ministère ne publie pas la liste nominative.",
    scope: "France entière",
    reference_date: "2026-10-05",
    source_url: SRC,
  },
  {
    publisher: "Ministre de l'Éducation nationale (Édouard Geffray)",
    figure: null,
    figure_text: "entre 400 et 500 lycées concernés",
    definition:
      "Suspension TOTALE ou PARTIELLE des cours. Fourchette : ce n'est pas un " +
      "nombre d'établissements fermés, c'est un intervalle.",
    scope: "France entière, lycées",
    reference_date: "2026-10-05",
    source_url: SRC,
  },
  {
    publisher: "Région Île-de-France (Valérie Pécresse)",
    figure: null,
    figure_text: "plus de 160 des 468 lycées publics franciliens fermés",
    definition:
      "Fermetures déclarées, périmètre lycées PUBLICS uniquement. " +
      "Soit plus d'un tiers du parc régional.",
    scope: "Île-de-France, lycées publics",
    reference_date: "2026-10-05",
    source_url: SRC,
  },
  {
    publisher: "Préfecture de police de Paris",
    figure: 13,
    figure_text: "13 lycées fermés",
    definition:
      "Recensement nominatif de lycées fermés à Paris. Seule source de la " +
      "liste qui nomme les établissements un par un.",
    scope: "Paris",
    reference_date: "2026-10-02",
    source_url: SRC,
  },
  {
    publisher: "Bilan du pic du 1er octobre",
    figure: null,
    figure_text: "près de 30 % des 3 600 lycées français",
    definition:
      "Part des lycens « mobilisés », tous statuts confondus (fermés, bloqués, " +
      "perturbés). Proportion, pas un effectif d'établissements.",
    scope: "France entière, lycées",
    reference_date: "2026-10-01",
    source_url: SRC,
  },
  {
    publisher: "Préfectures franciliennes",
    figure: null,
    figure_text: "plus d'une centaine d interdictions de rassemblement",
    definition:
      "Arrêtés interdisant les rassemblements devant plus d'une centaine " +
      "d'établissements. Compte des INTERDICTIONS, pas des blocages.",
    scope: "Paris, 92, 93, 94, 78, 77",
    reference_date: "2026-10-05",
    source_url: SRC,
  },
];

const deja = listExternalCounts().length;
for (const c of COMPTES) addExternalCount(c);

console.log(`${COMPTES.length} décomptes externes enregistrés (${deja} déjà en base).`);
console.log("Aucun n'est fusionné avec notre décompte : les méthodes diffèrent.\n");

const nous = ourOwnCount();
console.log("Pour mémoire, notre décompte dans la même forme :");
console.log(`  ${nous.publisher} — ${nous.figure_text}`);
console.log(`  ${nous.definition}\n`);

console.log(`${listExternalCounts().length} décomptes en base.`);
