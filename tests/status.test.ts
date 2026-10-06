/**
 * Tests du calcul de statut — les cas que le PRD nomme explicitement (§34).
 * Run : node tests/status.test.ts   (pas de framework : node:test + node:assert)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSchoolStatus, type StatusComputation } from "../lib/db/status.ts";
import type { ConfidenceLevel, EventStatus } from "../types/index.ts";

const NOW = new Date("2026-10-06T12:00:00Z");
const H = 3_600_000;

interface FakeEvent {
  status: EventStatus;
  event_date: string;
  confidence_level?: ConfidenceLevel;
  confidence_reason?: string;
  valid_until?: string | null;
  source_count?: number;
  source_types?: string;
}

const ev = (e: FakeEvent) => ({
  id: Math.random(),
  status: e.status,
  confidence_level: e.confidence_level ?? ("C" as ConfidenceLevel),
  confidence_reason: e.confidence_reason ?? "une seule source crédible",
  event_date: e.event_date,
  valid_until: e.valid_until ?? null,
  detected_at: e.event_date,
  source_count: e.source_count ?? 1,
  source_types: e.source_types ?? "local_media",
});

const compute = (events: FakeEvent[]): StatusComputation =>
  computeSchoolStatus(1, events as never, NOW);

// ---------------------------------------------------------------- §4.5
test("§4.5 — aucun événement donne AUCUNE_INFO, jamais NORMAL", () => {
  const r = compute([]);
  assert.equal(r.status, "AUCUNE_INFO");
  assert.notEqual(r.status, "NORMAL");
  assert.match(r.notes.join(" "), /Aucune information/);
});

// ---------------------------------------------------------------- §7
test("§7 — un statut opérationnel est restitué tel quel", () => {
  const r = compute([ev({ status: "FERME", event_date: "2026-10-06T09:00:00Z" })]);
  assert.equal(r.status, "FERME");
});

test("§7 — BLOQUE n'est jamais déduit d'un FERME", () => {
  const r = compute([ev({ status: "FERME", event_date: "2026-10-06T09:00:00Z" })]);
  assert.notEqual(r.status, "BLOQUE");
});

// ---------------------------------------------------------------- §27
test("§27 — FERME et PERTURBE frais = CONTRADICTOIRE, sans désigner de gagnant", () => {
  const r = compute([
    ev({ status: "FERME", event_date: "2026-10-06T09:00:00Z" }),
    ev({ status: "PERTURBE", event_date: "2026-10-06T09:30:00Z" }),
  ]);
  assert.equal(r.status, "CONTRADICTOIRE");
  assert.equal(r.confidence_level, "CONTRADICTOIRE");
  assert.match(r.notes.join(" "), /Aucun statut arbitraire/);
});

test("§27 — un conflit sur événements périmés ne bloque pas le statut courant", () => {
  const vieux = "2026-09-20T09:00:00Z";
  const r = compute([
    ev({ status: "FERME", event_date: vieux }),
    ev({ status: "PERTURBE", event_date: vieux }),
    ev({ status: "FERME", event_date: new Date(NOW.getTime() - 2 * H).toISOString() }),
  ]);
  assert.equal(r.status, "FERME");
});

test("§27 — deux sources qui disent la même chose ne sont pas une contradiction", () => {
  const r = compute([
    ev({ status: "FERME", event_date: "2026-10-06T09:00:00Z" }),
    ev({ status: "FERME", event_date: "2026-10-06T08:00:00Z" }),
  ]);
  assert.equal(r.status, "FERME");
});

// ---------------------------------------------------------------- §28
test("§28 — information trop ancienne = EXPIRE, conservée", () => {
  const r = compute([ev({ status: "SIGNALE", event_date: "2026-10-02T08:00:00Z" })]);
  assert.equal(r.status, "EXPIRE");
  assert.equal(r.last_event_date, "2026-10-02T08:00:00Z");
  assert.notEqual(r.status, "AUCUNE_INFO");
});

test("§28 — une source institutionnelle ancienne n'est pas 'fraîche' par exception", () => {
  const r = compute([
    ev({
      status: "FERME",
      event_date: "2026-10-01T08:00:00Z",
      confidence_level: "A",
      source_types: "prefecture",
    }),
  ]);
  assert.equal(r.status, "EXPIRE");
});

test("§28 — valid_until dans le futur prolonge la validité", () => {
  const r = compute([
    ev({
      status: "FERME",
      event_date: "2026-10-02T08:00:00Z",
      valid_until: "2026-10-07T08:00:00Z",
    }),
  ]);
  assert.equal(r.status, "FERME");
});

// ---------------------------------------------------------------- §8
test("§8 — 1 source = niveau C, pas de promotion", () => {
  const r = compute([ev({ status: "PERTURBE", event_date: "2026-10-06T09:00:00Z" })]);
  assert.equal(r.status, "PERTURBE");
  assert.equal(r.confidence_level, "C");
});

test("§8 — 2 sources dont 1 institutionnelle = promotion CONFIRME niveau A", () => {
  const r = compute([
    ev({
      status: "FERME",
      event_date: "2026-10-06T09:00:00Z",
      source_count: 2,
      source_types: "prefecture,local_media",
    }),
  ]);
  assert.equal(r.status, "CONFIRME");
  assert.equal(r.confidence_level, "A");
});

test("§26 — 15 reprises du même communiqué ne valent pas 2 sources indépendantes", () => {
  // Même type de source : pas de corroboration. On ne monte pas en A.
  const r = compute([
    ev({
      status: "FERME",
      event_date: "2026-10-06T09:00:00Z",
      source_count: 2,
      source_types: "local_media,local_media",
    }),
  ]);
  assert.equal(r.status, "FERME");
  assert.notEqual(r.confidence_level, "A");
});

test("§8 — 2 sources sans institutionnelle ne promeut pas en A", () => {
  const r = compute([
    ev({
      status: "FERME",
      event_date: "2026-10-06T09:00:00Z",
      source_count: 3,
      source_types: "local_media,organization,national_media",
    }),
  ]);
  assert.notEqual(r.confidence_level, "A");
});

// ---------------------------------------------------------------- §30
test("§30 — la confiance est toujours accompagnée d'une explication", () => {
  for (const events of [
    [],
    [ev({ status: "FERME", event_date: "2026-10-06T09:00:00Z" })],
    [ev({ status: "SIGNALE", event_date: "2026-09-01T09:00:00Z" })],
  ]) {
    const r = compute(events);
    if (r.confidence_level) {
      assert.ok(r.confidence_reason && r.confidence_reason.length > 0, "raison manquante");
    }
  }
});

test("§30 — aucun statut n'est produit depuis un simple 'aucune info'", () => {
  const r = compute([]);
  assert.equal(r.confidence_level, null);
  assert.equal(r.source_count, 0);
});
