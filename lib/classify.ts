/**
 * Classification déterministe d'un extrait de presse en statut (PRD §15).
 *
 * Pas de LLM. Des motifs explicites, testables, et une sortie TOUJOURS
 * identifiée comme interprétation automatisée : rien n'est publié sans
 * validation humaine (PRD §30).
 *
 * Principe : on ne reconnaît que ce que la source ÉCRIT. « le lycée est
 * bloqué » donne BLOQUE. « des élèves，此前 devant le lycée » ne donne rien.
 */

import type { EventStatus } from "../types/index.ts";

export interface Classification {
  status: EventStatus | null;
  /** Motif qui a déclenché, pour l'affichage. Jamais de décision muette. */
  matched: string | null;
  /** Le texte contient-il vraiment une affirmation sur l'établissement ? */
  is_fact_about_school: boolean;
  /** Avertissement : la source parle-t-elle de l'établissement ou du thème ? */
  confidence: "D";
  notes: string[];
}

/**
 * Entre le mot « lycée » et le verbe, il y a presque toujours le NOM de
 * l'établissement : « le lycée Jean Moulin à Bordeaux est fermé ». Un motif qui
 * colle les deux mot à mot ne matche jamais du texte réel.
 */
const GAP = String.raw`(?:\s+[\p{L}\p{N}'’.\-()]+){0,6}?`;
const ETAB = String.raw`(?:lyc[ée]e|coll[èe]ge|établissement|établissements)`;

/**
 * Piège JavaScript : `\w` reste ASCII **même avec le flag `u`**. Un `\b`
 * placé après « fermé » ne matche donc jamais, car « é » n'est pas un
 * caractère de mot pour `\b`. D'où les assertions Unicode explicites.
 */
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;

/**
 * Ordre = force de l'affirmation. On garde le motif le plus fort : « fermé »
 * l'emporte sur « perturbé », parce que c'est le statut le plus contraignant.
 * BLOQUE n'est retenu que si le mot l'est explicitement (§7).
 */
export const PATTERNS: Array<{ status: EventStatus; re: RegExp }> = [
  // --- FERME
  { status: "FERME", re: new RegExp(String.raw`${START}${ETAB}${GAP}\s+(?:est|sont|ont\s+été|reste|restera)\s+ferm[ée]e?s?${END}`, "iu") },
  { status: "FERME", re: new RegExp(String.raw`${START}${ETAB}${GAP}\s+ferm[ée]e?s?${END}\s+par\s+(?:l[’']?administration|la\s+(?:ville|r[ée]gion|collectivit[ée]))`, "iu") },
  { status: "FERME", re: new RegExp(String.raw`${START}fermeture\s+(?:de\s+(?:l[’'])?(?:lyc[ée]e|coll[èe]ge|établissement)|des\s+lyc[ée]es)${END}`, "iu") },

  // --- BLOQUE
  { status: "BLOQUE", re: new RegExp(String.raw`${START}${ETAB}${GAP}\s+(?:est|sont|ont\s+été|reste|restent)\s+bloqu[ée]e?s?${END}`, "iu") },
  { status: "BLOQUE", re: new RegExp(String.raw`${START}blocage\s+du\s+(?:lyc[ée]e|coll[èe]ge|établissement)${END}`, "iu") },
  { status: "BLOQUE", re: new RegExp(String.raw`${START}(?:ont|a)\s+bloqu[ée]e?s?${END}\s+(?:les\s+)?(?:acc[èe]s?|l[’']?entr[ée]e|le\s+portail)`, "iu") },
  { status: "BLOQUE", re: new RegExp(String.raw`${START}(?:acc[èe]s?|l[’']?entr[ée]e|le\s+portail)${GAP}\s+(?:a\s+été|ont\s+été|est)\s+bloqu[ée]e?s?${END}`, "iu") },

  // --- PERTURBE
  { status: "PERTURBE", re: new RegExp(String.raw`${START}${ETAB}${GAP}\s+(?:est|sont|ont\s+été|reste)\s+perturb[ée]e?s?${END}`, "iu") },
  { status: "PERTURBE", re: new RegExp(String.raw`${START}perturbation(?:s)?${GAP}(?:dans|au|à|du|de)\s+(?:le\s+|l[’'])?(?:lyc[ée]e|coll[èe]ge|établissement)${END}`, "iu") },
  { status: "PERTURBE", re: new RegExp(String.raw`${START}cours\s+(?:sont\s+|ont\s+été\s+|seront\s+)?suspendus?${END}`, "iu") },
  { status: "PERTURBE", re: new RegExp(String.raw`${START}(?:gr[èe]ve|gr[èe]vent)\s+(?:des\s+)?(?:professeurs?|enseignants?)${GAP}\s+(?:dans|au|à)\s+(?:le\s+|l[’'])?${ETAB}`, "iu") },

  // --- SIGNALÉ
  { status: "SIGNALE", re: new RegExp(String.raw`${START}mobilisation\s+(?:des\s+)?(?:élèves|lycéens|collégiens|lyc[ée]ens|étudiants)${END}`, "iu") },
  { status: "SIGNALE", re: new RegExp(String.raw`${START}(?:élèves|lycéens|collégiens)${GAP}\s+(?:occupent|occup[ée]rent|bloquent)${END}`, "iu") },
  { status: "SIGNALE", re: new RegExp(String.raw`${START}(?:assembl[ée]e?|rassemblement|manifestation)${GAP}\s+(?:devant|à|au)\s+(?:le\s+|l[’'])?${ETAB}`, "iu") },
];

/**
 * Mention explicite d'un établissement. Sans elle, le texte parle du thème
 * national, pas de CE lycée : on ne rattache rien.
 */
/**
 * Mot d'un nom propre : la première lettre en majuscule OU un mot内置 connu.
 * Les communes et les noms d'établissements sont souvent en minuscules dans
 * une phrasecourante : « le lycée oméga à villetest ». Exiger une majuscule
 * fait perdre la moitié des mentions.
 */
const NAME_WORD = String.raw`(?:[A-ZÀ-Ö][\p{L}'’-]{1,}|[a-zà-öœæ]{2,})`;
const SCHOOL_MENTION = new RegExp(
  String.raw`${START}(?:lyc[ée]e|coll[èe]ge|établissement)\s+((?:${NAME_WORD})(?:\s+(?:${NAME_WORD}|de|du|des|la|le|l[’'])){0,5})`,
  "iu",
);

export interface Extraction extends Classification {
  /** Nom d'établissement cité, si détecté. À confirmer par un humain. */
  school_name: string | null;
  /** UAI cité explicitement. */
  uai: string | null;
}

export function classify(text: string): Extraction {
  const notes: string[] = [];
  const clean = text.replace(/\s+/g, " ").trim();

  // UAI explicite — extrait AVANT le nom, sinon « UAI 0330026Z » est lu comme
  // un nom d'établissement.
  const uaiMatch = clean.match(/\bUAI\s*(\d{7}[A-Z])\b/i) ?? clean.match(/\b(\d{7}[A-Z])\b/);
  const uai = uaiMatch ? uaiMatch[1].toUpperCase() : null;
  const withoutUai = uai ? clean.replace(uaiMatch![0], " ") : clean;

  // Nom d'établissement
  const mention = withoutUai.match(SCHOOL_MENTION);
  const schoolName = mention ? mention[1]?.trim() ?? null : null;

  let status: EventStatus | null = null;
  let matched: string | null = null;

  for (const p of PATTERNS) {
    const m = clean.match(p.re);
    if (m) {
      status = p.status;
      matched = m[0];
      break;
    }
  }

  const mentionsSchool = Boolean(uai) || Boolean(schoolName);

  if (!status) {
    notes.push("Aucun motif de statut reconnu dans l'extrait.");
  }
  if (!mentionsSchool && status) {
    notes.push(
      "Le texte décrit un statut mais ne nomme aucun établissement : " +
        "aucun rattachement automatique n'est possible.",
    );
  }

  return {
    status,
    matched,
    is_fact_about_school: mentionsSchool && status !== null,
    confidence: "D",
    school_name: schoolName,
    uai,
    notes,
  };
}

/**
 * Description affichable : le FAIT, pas l'interprétation (PRD §4.4).
 * On recopie la phrase source telle quelle, jamais « fortement mobilisé ».
 */
export function factSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?…]+[.!?…]?/g) ?? [clean];
  const hit = sentences.find((s) => classify(s).status !== null);
  return (hit ?? clean).trim().slice(0, 600);
}
