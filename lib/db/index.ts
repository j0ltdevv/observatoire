/**
 * Accès base : `node:sqlite` (module natif Node 22+).
 *
 * Choix : pas de better-sqlite3. Bun 1.4.0 fait un NAPI FATAL ERROR à
 * l'import de better-sqlite3 (panique 8d4c7b1), et le module natif fait
 * le même travail sans binaire à compiler ni à reconstruire à chaque
 * changement de version de Node.
 *
 * Un jour on migre vers Postgres/Supabase : seule cette fonction change,
 * le SQL de lib/db/*.ts reste identique (SQLite et Postgres partagent 90 %
 * du dialecte utilisé ici).
 */

import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

export type Params = Record<string, SQLInputValue>;

export const DB_PATH =
  process.env.OBSERVATOIRE_DB ?? path.join(process.cwd(), "data", "observatoire.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(readFileSync(path.join(process.cwd(), "lib", "db", "schema.sql"), "utf8"));

  _db = db;
  return db;
}

/** `node:sqlite` n'a pas de helper de transaction : on l'écrit. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Horodatage unique au format utilisé partout dans le schéma. */
export const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/**
 * `node:sqlite` est typé en `Record<string, SQLOutputValue>` : tout cast vers
 * une interface métier passe par ici. Un seul endroit à faire confiance, plutôt
 * qu'un `as unknown as`spread dans chaque fichier de requêtes.
 */
export function all<T>(db: DatabaseSync, sql: string, params?: Params): T[] {
  return (params ? db.prepare(sql).all(params) : db.prepare(sql).all()) as T[];
}

export function get<T>(db: DatabaseSync, sql: string, params?: Params): T | undefined {
  return (params ? db.prepare(sql).get(params) : db.prepare(sql).get()) as T | undefined;
}

export function run(db: DatabaseSync, sql: string, params?: Params) {
  return params ? db.prepare(sql).run(params) : db.prepare(sql).run();
}
