// POST /api/sync/push
// OFFLINE-01 — point d'entrée unique du moteur de synchronisation. Reçoit
// un lot de mutations en attente depuis l'outbox locale et les applique
// une par une, dans l'ordre reçu (Phase 3 : ordonné par établissement).
//
// Sécurité (Phase 8) : le client de session normal est utilisé pour tout
// (auth, lecture du registre) ; l'écriture métier elle-même passe par la
// fonction SECURITY DEFINER sync_apply_absence_create, qui reproduit
// manuellement — sans l'élargir — la même autorisation qu'un insert
// direct en ligne aurait eu (policy absences_directeur + garde forfait
// "pro"). Si un droit a été retiré pendant que l'utilisateur était
// hors-ligne, la fonction refuse exactement comme un insert en ligne
// l'aurait fait, et la mutation revient "rejected", jamais appliquée en
// silence.
//
// Idempotence (Phase 2) : voir le raisonnement dans la migration —
// l'atomicité insert-absence + insert-registre dans une seule transaction
// PL/pgSQL garantit qu'un double envoi concurrent ne peut jamais créer
// deux fois la même donnée.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OfflineMutationWire, SyncMutationResult } from "@/lib/offline/types";

type SupportedEntity = "absence";

function isSupportedEntity(entityType: string): entityType is SupportedEntity {
  return entityType === "absence";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const mutations: OfflineMutationWire[] | undefined = body?.mutations;
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return NextResponse.json({ error: "Aucune mutation fournie" }, { status: 400 });
  }
  if (mutations.length > 50) {
    return NextResponse.json({ error: "Lot trop volumineux (maximum 50 mutations par envoi)" }, { status: 400 });
  }

  const results: SyncMutationResult[] = [];
  for (const mutation of mutations) {
    results.push(await applyOne(supabase, mutation));
  }

  return NextResponse.json({ results });
}

async function applyOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mutation: OfflineMutationWire
): Promise<SyncMutationResult> {
  const { mutationId, entityType, operation, establishmentId } = mutation;

  if (!mutationId || !entityType || !operation || !establishmentId) {
    return { mutationId: mutationId ?? "unknown", status: "rejected", error: "Mutation malformée" };
  }

  if (!isSupportedEntity(entityType)) {
    return recordRejection(supabase, mutation, `Type d'entité non pris en charge : ${entityType}`);
  }

  if (operation !== "create") {
    // Phase 9 : le contrat générique existe, mais seule la création est
    // câblée pour le pilote "absence" dans ce sprint — aucune table
    // actuelle ne porte de colonne updated_at/version permettant une mise
    // à jour offline sûre (voir Phase 0 / conflict.ts).
    return recordRejection(supabase, mutation, `Opération "${operation}" non encore prise en charge pour ${entityType}`);
  }

  return applyAbsenceCreate(supabase, mutation);
}

async function applyAbsenceCreate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mutation: OfflineMutationWire
): Promise<SyncMutationResult> {
  const payload = mutation.payload as {
    staff_member_id?: string;
    type?: string;
    date_debut?: string;
    date_fin?: string;
    motif?: string | null;
  };

  if (!payload?.staff_member_id || !payload.type || !payload.date_debut || !payload.date_fin) {
    return recordRejection(supabase, mutation, "Champs requis manquants");
  }

  const { data, error } = await supabase
    .rpc("sync_apply_absence_create", {
      p_mutation_id: mutation.mutationId,
      p_establishment_id: mutation.establishmentId,
      p_staff_member_id: payload.staff_member_id,
      p_type: payload.type,
      p_date_debut: payload.date_debut,
      p_date_fin: payload.date_fin,
      p_motif: payload.motif || null,
    })
    .single();

  if (error || !data) {
    return { mutationId: mutation.mutationId, status: "rejected", error: error?.message ?? "Échec de synchronisation" };
  }

  const row = data as { result_status: string; result_entity_id: string | null; result_error: string | null };
  const status = row.result_status as SyncMutationResult["status"];

  return {
    mutationId: mutation.mutationId,
    status,
    serverId: row.result_entity_id ?? undefined,
    error: row.result_error ?? undefined,
  };
}

// Rejets qui n'impliquent aucune écriture métier (type non supporté,
// opération non câblée) : aucune course possible sur l'absence d'effet de
// bord, un upsert ignorant les doublons suffit à rester idempotent.
async function recordRejection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mutation: OfflineMutationWire,
  error: string
): Promise<SyncMutationResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("sync_mutations")
    .upsert(
      {
        mutation_id: mutation.mutationId,
        entity_type: mutation.entityType,
        operation: mutation.operation,
        establishment_id: mutation.establishmentId,
        actor_user_id: user?.id,
        entity_id: null,
        status: "rejected",
        error,
      },
      { onConflict: "mutation_id", ignoreDuplicates: true }
    );

  return { mutationId: mutation.mutationId, status: "rejected", error };
}
