// OFFLINE-01 Phase 9 — contrat commun de mutation offline. Toute future
// fonctionnalité (Présence, Incident, Timesheet, ...) réutilise ce contrat
// plutôt que de reconstruire son propre mécanisme offline.

export type MutationOperation = "create" | "update" | "delete";

export type MutationStatus =
  | "pending" // en attente d'envoi
  | "syncing" // envoi en cours
  | "synced" // confirmé par le serveur
  | "error" // échec (retryable)
  | "conflict" // conflit détecté, nécessite une résolution
  | "rejected"; // refusé définitivement par le serveur (ex: droit retiré)

// Types d'entités supportées par le moteur. "draft-note" n'est utilisé que
// par les tests génériques de conflit (Phase 4) — aucune fonctionnalité
// réelle de ce type n'existe encore dans ce sprint.
export type OfflineEntityType = "absence" | "attendance" | "draft-note";

export type OfflineMutation<TPayload = unknown> = {
  mutationId: string; // uuid client — clé d'idempotence
  entityType: OfflineEntityType;
  operation: MutationOperation;
  entityId: string | null; // id serveur connu (update/delete), null pour create
  localId: string; // corrélation locale stable, même avant ack serveur
  payload: TPayload;
  baseVersion: string | null; // dernier server_updated_at connu du client, pour détection de conflit
  deviceTimestamp: string; // horodatage de l'appareil — jamais source de vérité seule (Phase 11)
  userId: string;
  establishmentId: string;
  status: MutationStatus;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAtLocal: string;
  syncedAt: string | null;
};

export type EnqueueMutationInput<TPayload = unknown> = Pick<
  OfflineMutation<TPayload>,
  "entityType" | "operation" | "entityId" | "payload" | "baseVersion" | "userId" | "establishmentId"
>;

// Wire format envoyé à POST /api/sync/push — sous-ensemble de OfflineMutation,
// le serveur ne fait jamais confiance à un champ de statut/retry venant du client.
export type OfflineMutationWire = Pick<
  OfflineMutation,
  "mutationId" | "entityType" | "operation" | "entityId" | "payload" | "baseVersion" | "deviceTimestamp" | "establishmentId"
>;

export type SyncMutationResult = {
  mutationId: string;
  status: "applied" | "duplicate" | "rejected" | "conflict";
  serverId?: string;
  serverUpdatedAt?: string | null;
  error?: string;
};

export type SyncPushResponse = {
  results: SyncMutationResult[];
};
