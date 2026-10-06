/**
 * Page méthodologie — obligatoire (PRD §25).
 *
 * Elle explique ce que les chiffres veulent dire ET ce qu'ils ne veulent pas
 * dire. C'est la page qui empêche le registre d'être lu comme un décompte de
 * vérité.
 */

import Link from "next/link";
import { OFFICIAL_DATASET_ID } from "@/scripts/import-schools";
import { FRESHNESS_HOURS_LABEL } from "@/lib/db/status";

export const dynamic = "force-static";

export default function MethodologiePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Méthodologie</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        Cet observatoire ne publie pas « le vrai chiffre » de la mobilisation. Il tient un
        registre de ce qui est <em>documenté publiquement</em>, où, quand, par quelle
        source, et avec quel niveau de confiance.
      </p>

      <Section title="1. Les établissements">
        <p>
          Les <strong>établissements viennent d&apos;un seul jeu de données officiel</strong> :{" "}
          <span className="font-mono text-[11px]">{OFFICIAL_DATASET_ID}</span>, publié par
          l&apos;Ministère de l&apos;Éducation nationale. Chaque ligne porte un{" "}
          <strong>numéro UAI</strong>, identifiant stable et unique.
        </p>
        <p className="mt-2">
          L&apos;UAI est le seul identifiant utilisé. Jamais le nom d&apos;un établissement :
          plusieurs lycées portent le même nom, et un nom change. Quand une source
          mentionne « Lycée Jean Moulin », le système cherche l&apos;UAI par nom et commune,
          et{" "}
          <strong>si plusieurs correspondent, il ne tranche pas</strong> — le cas passe en
          validation humaine.
        </p>
      </Section>

      <Section title="2. Périmètre géographique">
        <p>
          La carte montre la <strong>France métropolitaine</strong> (métropole et Corse). Les
          départements et collectivités d&apos;outre-mer sont bien importés et marqués, mais
          exclus de la vue nationale. Ce n&apos;est pas un oubli : c&apos;est un choix
          d&apos;affichage, et les données restent interrogeables.
        </p>
      </Section>

      <Section title="3. Ce qu'est un signalement">
        <p>
          Un <strong>signalement</strong> est une information publiée par une source
          vérifiable, rattachée à un UAI, datée, et publiée avec son URL. Un signalement
          n&apos;est pas une vérité : c&apos;est une affirmation documentée.
        </p>
      </Section>

      <Section title="4. Ce qu'est une confirmation">
        <p>
          Un établissement ne passe en <strong>CONFIRMÉ</strong> que si deux conditions
          cumulatives sont réunies :
        </p>
        <ul>
          <li>au moins <strong>deux sources indépendantes</strong> ;</li>
          <li>
            dont au moins une <strong>source institutionnelle</strong> (préfecture, ministère,
            académie) ou officielle.
          </li>
        </ul>
        <p className="mt-2">
          Quinze sites qui reprennent le même communiqué ne comptent pas comme quinze
          confirmations : le système cherche la source d&apos;origine et ne compte qu&apos;elle.
        </p>
      </Section>

      <Section title="5. Les contradictions">
        <p>
          Si deux sources crédibles et récentes donnent des statuts incompatibles
          (« fermé » contre « ouvert normalement »), l&apos;établissement passe en{" "}
          <strong>CONTRADICTOIRE</strong>. Le système ne choisit pas la source la plus
          commode : il affiche les deux versions et la date de vérification. Un conflit
          n&apos;est jamais effacé silencieusement.
        </p>
      </Section>

      <Section title="6. L'expiration">
        <p>
          Une information ne représente pas indéfiniment le présent. Chaque statut a une
          durée de validité, après laquelle l&apos;établissement passe en{" "}
          <strong>EXPIRE</strong> — information conservée, mais signalée comme ancienne :
        </p>
        <ul className="mt-1">
          {Object.entries(FRESHNESS_HOURS_LABEL).map(([s, h]) => (
            <li key={s}>
              <span className="font-mono">{s}</span> : {h} h
            </li>
          ))}
        </ul>
      </Section>

      <Section title="7. « Aucune information » n'est pas « aucune mobilisation »">
        <p className="rounded bg-neutral-50 p-3">
          C&apos;est la règle la plus importante du registre. Un établissement sans
          information n&apos;est pas compté comme normal, ni comme non mobilisé : il est
          compté <strong>séparément</strong>, en gris sur la carte, et son total est publié
          à côté des autres. L&apos;absence de donnée n&apos;est jamais convertie en
          absence de fait.
        </p>
      </Section>

      <Section title="8. Comment les statistiques sont calculées">
        <p>
          Chaque chiffre affiché est une requête SQL directe sur la base, reproductible à
          l&apos;instant de la consultation. Les totaux par région, département et académie
          somment exactement au total national — c&apos;est vérifié par un test automatique,
          pas par une relecture.
        </p>
        <p className="mt-2">
          Les couleurs de la carte indiquent le <strong>statut documenté</strong>, jamais une
          opinion politique ni une appartenance. Elles décrivent ce que les sources disent,
          pas ce qui est vrai.
        </p>
      </Section>

      <Section title="9. Ce que ce registre n'est pas">
        <p>
          Ce n&apos;est pas un outil d&apos;organisation, de coordination ou
          d&apos;optimisation d&apos;une mobilisation. Aucune donnée personnelle n&apos;est
          collectée : ni noms d&apos;élèves, ni coordonnées individuelles, ni informations
          permettant d&apos;identifier un mineur. Le sujet du registre, c&apos;est
          l&apos;établissement et l&apos;information publique le concernant.
        </p>
      </Section>

      <Section title="10. Signaler une erreur">
        <p>
          Une information fausse, périmée ou mal rattachée fausse le registre et doit être
          signalée. Toute correction passe par une file de validation : un signalement
         entrant n&apos;est jamais publié immédiatement comme fait confirmé. L&apos;historique
          des statuts est conservé : une correction s&apos;ajoute, elle n&apos;écrase pas.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-neutral-200 pt-5">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}
