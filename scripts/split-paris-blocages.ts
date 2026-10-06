/**
 * Éclate en 13 candidats la phrase de la préfecture de police qui énumère les
 * lycées fermés le 2 octobre 2026 à Paris.
 *
 * Règle de transparence : `text` est la PHRASE VERBATIM de l'article, répétée
 * pour chaque lycée. `school_name` ne sert qu'à cibler le rattachement, et il
 * est lisible dans la base comme dans le journal d'ingestion. Aucune
 * reformulation du texte source n'est faite : le fait affiché reste la phrase
 * de la source, y compris sa formulation.
 *
 *   node scripts/split-paris-blocages.ts
 */

import { writeFileSync } from "node:fs";
import { getDb } from "../lib/db/index.ts";
import { ingestCandidate } from "../lib/ingest.ts";

const SRC =
  "https://www.sortiraparis.com/actualites/a-paris/articles/353296-manifestation-etudiante-du-6-octobre-quels-lycees-et-universites-mobilises-a-paris-et-en-ile-de-france";

/** Phrase verbatim de l'article. Une seule, non réécrite. */
const PHRASE =
  "Vendredi 2 octobre, la préfecture de police recensait 13 lycées fermés à Paris : " +
  "Martin-Nadaud, Jean-Lurçat, Pierre-Lescot, Turquetil, Caroline-Dorian, Edgar-Quinet, " +
  "Elisa-Lemonnier, Colbert, Marcel-Desprez, Simone-Weil, Henri-Bergson, Chaptal et Drouant.";

/** Les 13 noms, tels que la source les écrit. */
const LYCEES = [
  "Martin-Nadaud",
  "Jean-Lurçat",
  "Pierre-Lescot",
  "Turquetil",
  "Caroline-Dorian",
  "Edgar-Quinet",
  "Elisa-Lemonnier",
  "Colbert",
  "Marcel-Desprez",
  "Simone-Weil",
  "Henri-Bergson",
  "Chaptal",
  "Drouant",
];

const candidats = LYCEES.map((name) => ({
  url: `${SRC}#pp-${encodeURIComponent(name)}`,
  title: `Lycée ${name} (Paris) — fermé, source préfecture de police`,
  publisher: "Sortiraparis.com",
  source_type: "local_media" as const,
  published_at: "2026-10-05T12:56:00Z",
  event_date: "2026-10-02T00:00:00Z",
  origin_url: SRC,
  text: PHRASE,
  school_name: name,
  city: "Paris",
  etab_kind: "lycee" as const,
}));

writeFileSync("data/paris-blocages.json", `${JSON.stringify(candidats, null, 2)}\n`);

console.log(`${candidats.length} candidats écrits dans data/paris-blocages.json`);
console.log("Phrase conservée verbatim — le champ school_name ne sert qu'au ciblage.\n");

const db = getDb();
const verif = db.prepare(
  "SELECT COUNT(*) n FROM sources WHERE origin_url = @src AND url LIKE '%#pp-%'",
).get({ src: SRC }) as { n: number };
console.log(`Déjà en base : ${verif.n}. Relancer le script créerait des doublons.`);
