import type { createClient } from "@/lib/supabase/server";

// EVENT-01 — repository serveur pour lire le School Event Engine
// (20260915090000_event_01_school_event_engine.sql). Jamais de
// service_role, jamais de SQL brut non scopé : utilise le client de
// session normal de l'appelant, RLS (school_events_owner_read) fait
// respecter la frontière d'établissement. Aucun accès arbitraire — c'est
// exactement la surface qu'un futur AI Gateway devra emprunter, jamais
// une porte dérobée qui la contournerait (mission §35).

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SchoolEventType =
  | "student.present"
  | "student.absent"
  | "student.late"
  | "staff.checked_in"
  | "staff.checked_out"
  | "timesheet.approved"
  | "application.received"
  | "admission.accepted";

export type SchoolEvent = {
  id: string;
  eventType: SchoolEventType;
  establishmentId: string;
  occurredAt: string;
  recordedAt: string;
  actorUserId: string | null;
  subjectType: string;
  subjectId: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  schemaVersion: number;
};

function mapRow(row: {
  id: string;
  event_type: string;
  establishment_id: string;
  occurred_at: string;
  recorded_at: string;
  actor_user_id: string | null;
  subject_type: string;
  subject_id: string;
  source_type: string;
  source_id: string;
  metadata: Record<string, unknown>;
  schema_version: number;
}): SchoolEvent {
  return {
    id: row.id,
    eventType: row.event_type as SchoolEventType,
    establishmentId: row.establishment_id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    actorUserId: row.actor_user_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: row.metadata,
    schemaVersion: row.schema_version,
  };
}

// Requête quotidienne déterministe (mission §22) — triée chronologiquement,
// bornée par établissement + fenêtre temporelle, jamais une lecture
// non-scopée. `types` restreint optionnellement à un sous-ensemble du
// catalogue V1.
export async function getSchoolEvents(input: {
  supabase: SupabaseServerClient;
  establishmentId: string;
  from: string; // ISO timestamp inclusif
  to: string; // ISO timestamp exclusif
  types?: SchoolEventType[];
  limit?: number;
}): Promise<SchoolEvent[]> {
  let query = input.supabase
    .from("school_events")
    .select("id, event_type, establishment_id, occurred_at, recorded_at, actor_user_id, subject_type, subject_id, source_type, source_id, metadata, schema_version")
    .eq("establishment_id", input.establishmentId)
    .gte("occurred_at", input.from)
    .lt("occurred_at", input.to)
    .order("occurred_at", { ascending: true })
    .limit(input.limit ?? 500);

  if (input.types?.length) {
    query = query.in("event_type", input.types);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getSchoolEvents: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export type DailySchoolProofMetric =
  | "students_present"
  | "students_absent"
  | "students_late"
  | "staff_checked_in"
  | "staff_checked_out"
  | "applications_received"
  | "timesheets_approved";

export type DailySchoolProof = Partial<Record<DailySchoolProofMetric, { count: number; eventIds: string[] }>>;

// Preuve quotidienne déterministe, correction-aware (mission §37/§39) — un
// simple passe-plat vers get_daily_school_proof (SQL, security invoker,
// RLS toujours appliquée). Aucune agrégation recalculée côté application :
// une seule source de vérité pour ce calcul.
export async function getDailySchoolProof(input: {
  supabase: SupabaseServerClient;
  establishmentId: string;
  day: string; // 'YYYY-MM-DD'
}): Promise<DailySchoolProof> {
  const { data, error } = await input.supabase.rpc("get_daily_school_proof", {
    p_establishment_id: input.establishmentId,
    p_day: input.day,
  });
  if (error) throw new Error(`getDailySchoolProof: ${error.message}`);

  const proof: DailySchoolProof = {};
  for (const row of (data ?? []) as { metric: DailySchoolProofMetric; count_value: number; event_ids: string[] }[]) {
    proof[row.metric] = { count: Number(row.count_value), eventIds: row.event_ids ?? [] };
  }
  return proof;
}
