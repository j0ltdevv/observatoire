/**
 * Fiche établissement (PRD §19).
 *
 * Affiche le statut, les sources horodatées, l'historique — et dit
 * explicitement quand il n'y a rien, au lieu de laisser croire à une
 * situation normale (PRD §4.5).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEventsForSchool,
  getHistoryForSchool,
  getSchoolByUai,
} from "@/lib/db/queries";
import {
  CONFIDENCE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type ConfidenceLevel,
  type DisplayStatus,
} from "@/types";

export const dynamic = "force-dynamic";

const CONFIDENCE_RANK: ConfidenceLevel[] = ["A", "B", "C", "D", "CONTRADICTOIRE"];

interface SourceJson {
  id: number;
  url: string;
  title: string | null;
  publisher: string | null;
  source_type: string;
  published_at: string | null;
  retrieved_at: string;
  origin_url: string | null;
}

interface EventRow {
  id: number;
  status: DisplayStatus;
  description: string;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
  event_date: string;
  valid_until: string | null;
  sources: string | null;
}

function parseSources(raw: string | null): SourceJson[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as SourceJson[]).filter(Boolean);
  } catch {
    return [];
  }
}

const fr = (iso: string | null): string => {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ uai: string }>;
}) {
  const { uai } = await params;
  const school = getSchoolByUai(uai);
  if (!school) notFound();

  const status = (school.status ?? "AUCUNE_INFO") as DisplayStatus;
  const events = getEventsForSchool(school.id) as unknown as EventRow[];
  const history = getHistoryForSchool(school.id) as Array<{
    id: number;
    old_status: string | null;
    new_status: string;
    changed_at: string;
    reason: string;
    url: string | null;
  }>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Retour à la carte
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">{school.name}</h1>
      <p className="text-sm text-neutral-600">
        {school.city} ({school.department_name}) · Académie de {school.academy_name}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-700 sm:grid-cols-3">
        <Field k="UAI" v={school.uai} mono />
        <Field k="Type" v={school.school_type} />
        <Field k="Secteur" v={school.sector} />
        <Field k="Adresse" v={school.address ?? "—"} />
        <Field k="Code postal" v={school.postal_code ?? "—"} mono />
        <Field k="Région" v={school.region_name} />
        <Field k="Coordonnées" v={`${school.latitude.toFixed(5)}, ${school.longitude.toFixed(5)}`} mono />
        <Field k="État administratif" v={school.open_state ?? "—"} />
        <Field k="Source" v={school.source_dataset} mono />
      </dl>

      {/* -------------------------------------------------------- statut */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Statut documenté
        </h2>
        <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full ring-1 ring-black/10"
            style={{ background: STATUS_COLORS[status] }}
          />
          {STATUS_LABELS[status]}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Dernière information : {fr(school.last_event_date ?? null)}
        </p>

        {status === "AUCUNE_INFO" && (
          <p className="mt-3 rounded bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700">
            <strong>Aucune information publique collectée</strong> pour cet établissement.
            Cela ne signifie pas qu&apos;il n&apos;y a pas de mobilisation : cela signifie
            qu&apos;aucune source n&apos;a été trouvée, ou qu&apos;aucune n&apos;a pu être
            rattachée à cet UAI de façon vérifiable.
          </p>
        )}

        {status === "EXPIRE" && (
          <p className="mt-3 rounded bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            L&apos;information la plus récente est trop ancienne pour décrire la situation
            actuelle. Elle est conservée telle quelle, sans être rafraîchie ni effacée.
          </p>
        )}

        {status === "CONTRADICTOIRE" && (
          <p className="mt-3 rounded bg-red-50 p-3 text-xs leading-relaxed text-red-900">
            <strong>Sources crédibles incompatibles.</strong> Le système ne choisit pas
            arbitrairement laquelle dire vrai : les deux versions sont listées ci-dessous.
          </p>
        )}

        {school.confidence_level && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <p className="text-xs font-medium text-neutral-700">
              Confiance {school.confidence_level} —{" "}
              {CONFIDENCE_LABELS[school.confidence_level as ConfidenceLevel]}
            </p>
            {school.confidence_reason && (
              <p className="mt-1 text-xs text-neutral-600">{school.confidence_reason}</p>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- sources */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Sources et événements
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Aucun événement documenté. Rien n&apos;est déduit de ce vide.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {events.map((e) => {
              const sources = parseSources(e.sources);
              const rank = CONFIDENCE_RANK.indexOf(e.confidence_level);
              return (
                <li key={e.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                      style={{ background: STATUS_COLORS[e.status] }}
                    />
                    <span className="text-sm font-medium">{STATUS_LABELS[e.status]}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700">
                      confiance {e.confidence_level}
                    </span>
                  </div>

                  {/* Fait, pas interprétation (PRD §4.4) */}
                  <p className="mt-2 text-sm leading-relaxed text-neutral-800">
                    {e.description}
                  </p>

                  <p className="mt-2 text-xs text-neutral-600">
                    {CONFIDENCE_LABELS[e.confidence_level as ConfidenceLevel]}
                  </p>
                  <p className="text-xs text-neutral-600">{e.confidence_reason}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Événement daté du {fr(e.event_date)}
                    {e.valid_until && ` · valable jusqu'au ${fr(e.valid_until)}`}
                    {" · rang de fraîcheur "}
                    {rank}
                  </p>

                  {sources.length > 0 && (
                    <div className="mt-3 border-t border-neutral-100 pt-3">
                      <p className="text-[11px] font-semibold uppercase text-neutral-500">
                        {sources.length} source{sources.length > 1 ? "s" : ""}
                      </p>
                      <ul className="mt-1 space-y-1.5">
                        {sources.map((s) => (
                          <li key={s.id} className="text-xs">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-neutral-900 underline underline-offset-2"
                            >
                              {s.title ?? s.url}
                            </a>
                            <span className="ml-2 text-neutral-500">
                              {s.publisher ?? s.source_type} · publié {fr(s.published_at)} ·
                              collecté {fr(s.retrieved_at)}
                            </span>
                            {s.origin_url && (
                              <span className="ml-2 text-neutral-500">
                                · reprise de{" "}
                                <a
                                  href={s.origin_url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="underline underline-offset-2"
                                >
                                  la source originale
                                </a>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------- historique */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Historique des statuts
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Aucun changement enregistré. L&apos;historique n&apos;est jamais réécrit.
          </p>
        ) : (
          <ol className="mt-3 space-y-1 border-l border-neutral-200 pl-4">
            {history.map((h) => (
              <li key={h.id} className="text-xs">
                <span className="tabular-nums text-neutral-500">{fr(h.changed_at)}</span>
                <span className="mx-2 text-neutral-400">→</span>
                <span className="font-medium text-neutral-900">
                  {h.old_status ? `${STATUS_LABELS[h.old_status as DisplayStatus]} → ` : ""}
                  {STATUS_LABELS[h.new_status as DisplayStatus]}
                </span>
                <span className="ml-2 text-neutral-600">{h.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400">{k}</dt>
      <dd className={mono ? "font-mono text-[11px] break-all" : ""}>{v}</dd>
    </div>
  );
}
