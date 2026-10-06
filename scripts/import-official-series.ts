/**
 * Série de décomptes officiels par jour (PRD §17).
 *
 * Cette fois on enregistre des SÉRIES, pas des chiffres isolés : c'est
 * l'évolution qui est interprétable, pas un total isolé. Un « 589 » sans
 * savoir s'il remplace un « 800 » ou un « 413 » ne veut rien dire.
 *
 *   node scripts/import-official-series.ts
 */

import { addExternalCount, ourOwnCount } from "../lib/external-counts.ts";
import { getDb } from "../lib/db/index.ts";

const WIKI =
  "https://fr.wikipedia.org/wiki/Mouvement_et_blocus_lyc%C3%A9en_et_%C3%A9tudiant_de_2026_en_France";

/**
 * `figure_text` garde la formulation d'origine. `figure` ne porte l'entier que
 * lorsque la source publie un entier — sinon null, jamais arrondi.
 */
const SERIE = [
  {
    date: "2026-09-18",
    publisher: "Recensement des premières mobilisations",
    text: "premières tentatives de blocage recensées dès le 18 septembre",
    definition: "Premières tentatives de blocage, aucun décompte d'établissements.",
    figure: null,
  },
  {
    date: "2026-09-28",
    publisher: "Ministère de l'Intérieur",
    text: "180 établissements perturbés, dont 27 blocages totaux",
    definition: "Établissements perturbés le 28 septembre ; les 27 blocages sont un sous-ensemble.",
    figure: 180,
  },
  {
    date: "2026-09-29",
    publisher: "Ministère de l'Éducation nationale",
    text: "338 établissements perturbés et 45 bloqués",
    definition: "Deux catégories distinctes : perturbés d'un côté, bloqués de l'autre. Les 45 bloqués sont inclus dans les 338.",
    figure: 338,
  },
  {
    date: "2026-09-29",
    publisher: "Le Monde",
    text: "des actions dans près de 410 établissements",
    definition:
      "Recensement de la presse, méthode non publiée. Le Monde indique un chiffre " +
      "SUPÉRIEUR au ministère pour la même journée : les méthodes diffèrent.",
    figure: 410,
  },
  {
    date: "2026-09-30",
    publisher: "Ministre de l'Intérieur (Laurent Nuñez)",
    text: "356 établissements concernés",
    definition: "« Concernés par le mouvement », sans préciser bloqué / perturbé / fermé.",
    figure: 356,
  },
  {
    date: "2026-10-01",
    publisher: "Union étudiante et USL",
    text: "640 lycées bloqués",
    definition:
      "Décompte d'organisation syndicale. La fiche source précise que les autorités " +
      "publiques ne le confirment pas. Nombre revendiqué, pas constaté.",
    figure: 640,
  },
  {
    date: "2026-10-01",
    publisher: "Remontées policières via AFP",
    text: "900 actions recensées, dont 400 fermetures d'établissements",
    definition: "ACTIONS (manifestations comprises) et fermetures comptées séparément.",
    figure: 900,
  },
  {
    date: "2026-10-01",
    publisher: "Ministère de l'Éducation nationale",
    text: "plus de 400 lycées fermés au lendemain du 2 octobre, par précaution",
    definition:
      "Fermetures décidées PAR PRÉCAUTION par les chefs d'établissement, pour " +
      "sécurité. Aucune fermeture constatée. Ne pas confondre avec un blocus.",
    figure: 400,
  },
  {
    date: "2026-10-02",
    publisher: "Préfecture de police de Paris",
    text: "13 lycées fermés à Paris",
    definition: "Recensement nominatif. Seule liste qui nomme les établissements un par un.",
    figure: 13,
  },
  {
    date: "2026-10-05",
    publisher: "Ministère de l'Éducation nationale",
    text: "413 établissements touchés à la mi-journée, 589 sur la journée",
    definition:
      "« Touchés par des actions ou des perturbations ». Deux instantanés le même " +
      "jour : la mi-journée et la fin de journée. Le ministère parle de « décrue ».",
    figure: 589,
  },
  {
    date: "2026-10-05",
    publisher: "Ministère de l'Éducation nationale",
    text: "près de 800 la veille",
    definition: "Jour précédent, même méthode. Sert de point de comparaison au 589.",
    figure: 800,
  },
];

let ajoutes = 0;
for (const s of SERIE) {
  addExternalCount({
    publisher: s.publisher,
    figure: s.figure,
    figure_text: s.text,
    definition: s.definition,
    scope: "France entière sauf mention contraire",
    reference_date: s.date,
    source_url: WIKI,
  });
  ajoutes += 1;
}

const db = getDb();
const total = (db.prepare("SELECT COUNT(*) n FROM external_counts").get() as { n: number }).n;

console.log(`${ajoutes} entrées ajoutées. ${total} décomptes en base.\n`);

const dates = [...new Set(SERIE.map((s) => s.date))].sort();
for (const d of dates) {
  const du = SERIE.filter((s) => s.date === d);
  console.log(`${d}`);
  for (const u of du) {
    console.log(`   ${String(u.figure ?? "—").padStart(4)}  ${u.publisher}`);
  }
}

const nous = ourOwnCount();
console.log(`\nCet observatoire : ${nous.figure_text}`);
console.log("Aucune de ces séries n'est comparable ligne à ligne avec la nôtre :");
console.log("elles comptent des ACTIONS, des PERTURBATIONS ou des FERMETURES, pas des");
console.log("établissements rattachés à un UAI et validés. C'est exactement le but.");
