-- Observatoire des mobilisations.lycéennes — schéma V1 (SQLite)
-- Principe : aucune donnée sensible au temps sans horodatage.
-- Aucune source => jamais "confirmé".

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- schools
CREATE TABLE IF NOT EXISTS schools (
  id                INTEGER PRIMARY KEY,
  uai               TEXT NOT NULL UNIQUE,   -- identifiant stable, jamais le nom
  name              TEXT NOT NULL,
  official_name     TEXT,
  school_type       TEXT NOT NULL,          -- nature_uai_libe du dataset officiel
  nature_code       INTEGER,                -- 400 = lycée, 320 = collège ...
  sector            TEXT NOT NULL,          -- Public / Privé
  address           TEXT,
  postal_code       TEXT,
  city              TEXT NOT NULL,
  city_code         TEXT,
  department_code   TEXT NOT NULL,
  department_name   TEXT NOT NULL,
  region_code       TEXT NOT NULL,
  region_name       TEXT NOT NULL,
  academy_code      TEXT NOT NULL,
  academy_name      TEXT NOT NULL,
  latitude          REAL NOT NULL,
  -- Formes normalisées (sans accent, minuscules) calculées à l'import :
  -- SQLite n'a pas d'unaccent, impossible de les produire en SQL.
  norm_name         TEXT NOT NULL DEFAULT '',
  norm_city         TEXT NOT NULL DEFAULT '',
  norm_department   TEXT NOT NULL DEFAULT '',
  longitude         REAL NOT NULL,
  -- Périmètre du MVP : France métropolitaine (métropole + Corsique).
  -- Les DOM/Collectivités sont importés et marqués, jamais écartés en silence :
  -- "absent de la carte" doit être une décision lisible, pas un trou (PRD §7 note).
  scope             TEXT NOT NULL DEFAULT 'FR_METRO'
                     CHECK (scope IN ('FR_METRO','FR_OUTREMER')),
  open_state        TEXT,                  -- OUVERT / FERMÉ_ADMINISTRATIF (état administratif ≠ mobilisation)
  official_state    INTEGER,
  source_dataset    TEXT NOT NULL,
  source_updated_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_schools_uai        ON schools(uai);
CREATE INDEX IF NOT EXISTS idx_schools_dept       ON schools(department_code);
CREATE INDEX IF NOT EXISTS idx_schools_region     ON schools(region_code);
CREATE INDEX IF NOT EXISTS idx_schools_academy    ON schools(academy_code);
CREATE INDEX IF NOT EXISTS idx_schools_type       ON schools(school_type);
CREATE INDEX IF NOT EXISTS idx_schools_fts       ON schools(name, city);
CREATE INDEX IF NOT EXISTS idx_schools_scope     ON schools(scope);
CREATE INDEX IF NOT EXISTS idx_schools_normcity  ON schools(norm_city);

-- ------------------------------------------------------------- sources
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  publisher     TEXT,
  source_type   TEXT NOT NULL CHECK (source_type IN (
                  'official','school','prefecture','local_media',
                  'national_media','organization','public_statement','other')),
  published_at  TEXT,   -- ISO 8601, date de publication si connue
  retrieved_at  TEXT NOT NULL,   -- date de collecte
  last_checked_at TEXT,          -- dernière vérification
  content_hash  TEXT,            -- déduplication : même hash = même communiqué
  origin_url    TEXT,            -- URL de la source ORIGINAL si reprise
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_hash       ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_url        ON sources(url);
CREATE INDEX IF NOT EXISTS idx_sources_published  ON sources(published_at);

-- -------------------------------------------------- mobilization_events
CREATE TABLE IF NOT EXISTS mobilization_events (
  id               INTEGER PRIMARY KEY,
  school_id        INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN (
                     'SIGNALE','CONFIRME','FERME','PERTURBE',
                     'BLOQUE','CONTRADICTOIRE')),
  description      TEXT NOT NULL,   -- FAIT, pas interprétation
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('A','B','C','D','CONTRADICTOIRE')),
  confidence_reason TEXT NOT NULL,  -- §8 : toujours une explication
  detected_at      TEXT NOT NULL,   -- quand le système l'a vu
  event_date       TEXT NOT NULL,   -- quand l'info dit s'appliquer
  valid_until      TEXT,            -- au-delà => EXPIRE au calcul
  review_state     TEXT NOT NULL DEFAULT 'pending'
                     CHECK (review_state IN ('pending','review','accepted','rejected')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  created_by       TEXT NOT NULL DEFAULT 'pipeline'
);

CREATE INDEX IF NOT EXISTS idx_events_school      ON mobilization_events(school_id);
CREATE INDEX IF NOT EXISTS idx_events_status      ON mobilization_events(status);
CREATE INDEX IF NOT EXISTS idx_events_date        ON mobilization_events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_review      ON mobilization_events(review_state);

-- --------------------------------------------------------- event_sources
CREATE TABLE IF NOT EXISTS event_sources (
  event_id  INTEGER NOT NULL REFERENCES mobilization_events(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, source_id)
);

-- ------------------------------------------------------- status_history
CREATE TABLE IF NOT EXISTS status_history (
  id         INTEGER PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  old_status TEXT,     -- NULL => première observation, pas "NORMAL confirmé"
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  reason     TEXT NOT NULL,
  source_id  INTEGER REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS idx_history_school ON status_history(school_id, changed_at);

-- ------------------------------------------------ signalements non rattachés
-- Une source parle d'un établissement, mais le rattachement à un UAI échoue
-- (ambiguïté, correspondance trop faible, aucun nom). Le signalement n'est
-- PAS perdu : il attend une validation humaine (PRD §31).
CREATE TABLE IF NOT EXISTS unmatched_reports (
  id            INTEGER PRIMARY KEY,
  source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  quoted_name   TEXT,
  quoted_city   TEXT,
  proposed_status TEXT,
  extract       TEXT NOT NULL,
  match_kind    TEXT,
  match_reason  TEXT,
  candidates    TEXT,            -- JSON des candidats proposés au validateur
  review_state  TEXT NOT NULL DEFAULT 'pending'
                  CHECK (review_state IN ('pending','resolved','rejected')),
  resolved_school_id INTEGER REFERENCES schools(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_unmatched_state ON unmatched_reports(review_state);

-- --------------------------------------------------- computed status cache-- Dérivé, jamais écrit à la main. "Aucune info" => 'AUCUNE_INFO', pas NORMAL.
CREATE TABLE IF NOT EXISTS school_current (
  school_id       INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,
  confidence_level TEXT,
  confidence_reason TEXT,
  last_event_date TEXT,
  last_source_id  INTEGER REFERENCES sources(id),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
