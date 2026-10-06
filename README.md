# Observatoire des mobilisations des lycéens

Registre sourcé, horodaté et auditable des informations publiques sur la
mobilisation dans les établissements scolaires français.

Ce dépôt n'affirme pas connaître « la vraie mobilisation ». Il répond à une
autre question : **qu'est-ce qui est documenté publiquement, où, quand, par
quelle source, et avec quel niveau de confiance ?**

## Démarrage

```bash
bun install                 # ou npm install
node scripts/import-schools.ts   # ~63 000 établissements depuis le dataset officiel
node scripts/verify-import.ts    # contrôle d'intégrité de l'import
node lib/db/status.ts            # recalcule les statuts courants
npm run dev                      # http://localhost:3000
```

Tests :

```bash
node --test tests/       # 66 tests
npx tsc --noEmit        # types
npm run build           # build de production
```

## Ce qui est en place

| Étape | État |
|---|---|
| Import du dataset officiel (UAI) | 63 168 établissements, 60 650 en métropole |
| Carte Leaflet + clustering canvas |-clustering par maille écran, 20 000 points max |
| Recherche / filtres dans l'URL | région, département (code INSEE 3 chiffres), académie, période |
| Fiche établissement | statut, sources horodatées, historique |
| Statistiques | national, région, département |
| Pages | `/` `/statistics` `/methodologie` `/sources` `/admin` |
| Rattachement UAI | 5 niveaux, ambiguïté jamais tranchée automatiquement |
| Classification déterministe | 14 motifs FR, sans LLM |
| Pipeline d'ingestion | source → classification → rattachement → file de review |
| Dashboard de validation | accepter / rejeter / rattacher manuellement |

## Règles que le code encode

Les tests `tests/` existent pour prevent ces règles de régresser.

1. **Aucune information n'est jamais convertie en absence de mobilisation**
   (`tests/status.test.ts`, §4.5). Le statut `NORMAL` n'existe pas dans le
   code : un établissement sans donnée reçoit `AUCUNE_INFO`.
2. **Jamais d'établissement créé automatiquement** (`tests/matching.test.ts`,
   §34). Un rattachement ambigu ou trop faible part en file « sans
   correspondance », il n'est pas deviné.
3. **Rien n'est publié sans validation humaine** (`tests/ingest.test.ts`,
   §30). Le pipeline écrit toujours `review_state = 'pending'` et
   `confidence_level = 'D'`.
4. **Quinze reprises d'un communiqué valent une source** (`tests/ingest.test.ts`,
   §26). Déduplication par URL puis par hash de contenu normalisé.
5. **Une information ancienne n'est pas effacée** (§28) : elle passe `EXPIRE`
   et reste consultable.
6. **Aucune contradiction n'est résolue d'autorité** (§27) : le statut devient
   `CONTRADICTOIRE` et les deux versions sont affichées.
7. **Les totaux somment** : `tests/queries.test.ts` vérifie que la somme des
   statuts égale le total des établissements, par région et par département.

## Collecte

Le pipeline n'invente rien et ne publie rien. Il reçoit un fichier JSON de
candidats (issus d'un outil de recherche : Exa, RSS, presse) :

```bash
node scripts/ingest.ts data/presse.json
```

Format :

```json
[
  {
    "url": "https://exemple.fr/article",
    "title": "Titre de l'article",
    "publisher": "Nom du média",
    "source_type": "local_media",
    "published_at": "2026-10-06T08:15:00Z",
    "text": "Le lycée X à Y est fermé."
  }
]
```

`source_type` ∈ `official`, `school`, `prefecture`, `local_media`,
`national_media`, `organization`, `public_statement`, `other`.

Tout arrive dans `/admin`. Un humain valide, rejette ou rattache.

## Sources de données

| Donnée | Origine |
|---|---|
| Établissements | Ministère de l'Éducation nationale, `data.education.gouv.fr` |
| Dataset id | `fr-en-adresse-et-geolocalisation-etablissements-premier-et-second-degre` |
| Fond de carte | OpenStreetMap |
| Statuts | saisies humaines, via le pipeline d'ingestion |

L'identifiant d'un établissement est son **UAI**, jamais son nom.

## Périmètre

- **Carte** : France métropolitaine (60 650 établissements).
- **Base** : toute la France, outre-mer inclus et marqué `FR_OUTREMER`
  (2 518 établissements, 203 lycées). Rien n'est supprimé.
- **Lycées** : les sections d'enseignement sont exclues des statistiques —
  ce sont des annexes, pas des établissements autonomes.

## Limites connues

- Aucune collecte automatisée n'est branchée : le registre est vide tant que
  personne ne saisit. C'est le comportement correct, pas un bug.
- Le clustering se fait par maille écran : au zoom le plus serré, 20 000
  points maximum sont chargés.
- La base est un fichier SQLite. Le passage à Postgres/Supabase ne touche que
  `lib/db/index.ts`, le SQL restant identique.
