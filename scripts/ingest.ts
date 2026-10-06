/**
 * CLI d'ingestion.
 *
 * Usage :
 *   node scripts/ingest.ts data/presse.json
 *
 * Le JSON est un tableau de { url, title, publisher, source_type, published_at, text }.
 * Ce fichier est produit par un outil de recherche (Exa, RSS, …) : le pipeline
 * ne fait QUE normaliser, rattacher et mettre en file de review. Il ne publie
 * rien (PRD §30).
 */

import { readFileSync } from "node:fs";
import { ingestCandidate, type Candidate, type IngestOutcome } from "../lib/ingest.ts";
import { recomputeAllStatuses } from "../lib/db/status.ts";
import { getDb } from "../lib/db/index.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage : node scripts/ingest.ts <fichier.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, "utf8")) as Candidate[];
if (!Array.isArray(raw)) {
  console.error("le fichier doit contenir un tableau JSON");
  process.exit(1);
}

const counts: Record<IngestOutcome["kind"], number> = {
  queued: 0,
  queued_review: 0,
  duplicate: 0,
  skipped: 0,
};

console.log(`Ingestion de ${raw.length} candidat(s)…\n`);

for (const c of raw) {
  try {
    const out = ingestCandidate(c);
    counts[out.kind] += 1;
    switch (out.kind) {
      case "queued":
        console.log(`  ✓ ${out.status.padEnd(10)} ${out.uai}  ${c.url}`);
        break;
      case "queued_review":
        console.log(`  ? ${out.match_kind.padEnd(14)} ${c.url}`);
        console.log(`      → file de review (#${out.report_id}) : rattachement non univoque`);
        break;
      case "duplicate":
        console.log(`  = doublon   ${c.url}`);
        console.log(`      → ${out.reason}`);
        break;
      case "skipped":
        console.log(`  – ignoré    ${c.url}`);
        console.log(`      → ${out.reason}`);
        break;
    }
  } catch (err) {
    counts.skipped += 1;
    console.error(`  ! ERREUR ${c.url} : ${(err as Error).message}`);
  }
}

console.log(
  `\nRécapitulatif — ${counts.queued} en attente de validation, ` +
    `${counts.queued_review} sans rattachement, ${counts.duplicate} doublons, ` +
    `${counts.skipped} sans statut exploitable.`,
);
console.log("Aucun événement n'est publié à cette étape : tout est en file de review.");

const recomputed = recomputeAllStatuses();
const pending = getDb()
  .prepare(`SELECT COUNT(*) n FROM mobilization_events WHERE review_state = 'pending'`)
  .get() as { n: number };
console.log(`Statuts recalculés (${recomputed} établissements) — en attente : ${pending.n}.`);
