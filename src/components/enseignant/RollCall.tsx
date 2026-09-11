"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock3, Users } from "lucide-react";
import { enqueueMutation } from "@/lib/offline/outbox";
import { triggerManualSync } from "@/lib/offline/syncEngine";
import { getActiveSyncIdentity, subscribeActiveSyncIdentity } from "@/lib/offline/syncIdentity";
import { classRosterCacheKey, getCachedEntity } from "@/lib/offline/entityCache";
import { SyncStatus } from "@/components/offline/SyncStatus";

// MOBILE-01 Phase 7/8 — cœur de la mission : l'appel élève, offline-first,
// réutilisant le moteur OFFLINE-01/01.1/01.2/01.3 tel quel (aucun second
// moteur). Chaque tap enqueue une mutation "attendance" ; en ligne la
// synchronisation part immédiatement (même UX que le pilote absence), hors
// ligne l'état local est conservé et affiché sans jamais prétendre qu'un
// serveur a confirmé quoi que ce soit (SyncStatus, déjà partagé avec le
// pilote absence — pas un second indicateur concurrent, Phase 13).

type Status = "present" | "absent" | "late";
type Student = { id: string; firstName: string; lastName: string };

const STATUS_CONFIG: Record<Status, { label: string; icon: typeof CheckCircle2; activeClass: string }> = {
  present: { label: "Présent", icon: CheckCircle2, activeClass: "bg-emerald-600 text-white" },
  absent: { label: "Absent", icon: XCircle, activeClass: "bg-red-600 text-white" },
  late: { label: "Retard", icon: Clock3, activeClass: "bg-amber-500 text-white" },
};

export function RollCall({
  emploiDuTempsId,
  establishmentId,
  classeId,
  sessionDate,
  students: studentsProp,
  initialStatuses,
}: {
  emploiDuTempsId: string;
  establishmentId: string;
  classeId: string;
  sessionDate: string;
  students: Student[];
  initialStatuses: Record<string, Status>;
}) {
  const [userId, setUserId] = useState<string | null>(() => getActiveSyncIdentity().userId);
  const [students, setStudents] = useState<Student[]>(studentsProp);
  const [statuses, setStatuses] = useState<Record<string, Status>>(initialStatuses);
  const [error, setError] = useState("");

  useEffect(() => subscribeActiveSyncIdentity((identity) => setUserId(identity.userId)), []);

  // Repli hors-ligne : si la page a été rechargée sans réseau et que le
  // serveur n'a rien pu renvoyer (studentsProp vide), on retombe sur le
  // roster mis en cache pendant la dernière visite en ligne (Phase 12)
  // plutôt que d'afficher une liste vide qui laisserait croire que la
  // classe n'a aucun élève.
  useEffect(() => {
    if (studentsProp.length > 0) return;
    getCachedEntity<Student[]>(classRosterCacheKey(classeId))
      .then((cached) => {
        if (cached) setStudents(cached.value);
      })
      .catch(() => {});
  }, [studentsProp, classeId]);

  async function mark(studentId: string, status: Status) {
    if (!userId) return;
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
    setError("");
    try {
      await enqueueMutation({
        entityType: "attendance",
        operation: "create",
        entityId: null,
        payload: { emploi_du_temps_id: emploiDuTempsId, student_id: studentId, session_date: sessionDate, status },
        baseVersion: null,
        userId,
        establishmentId,
      });
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Échec de l'enregistrement local");
      return;
    }
    void triggerManualSync();
  }

  async function markAllPresent() {
    for (const student of students) {
      if (!statuses[student.id]) {
        await mark(student.id, "present");
      }
    }
  }

  const markedCount = Object.keys(statuses).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs font-semibold text-text-secondary">
          {markedCount}/{students.length} élève{students.length !== 1 ? "s" : ""} marqué{markedCount !== 1 ? "s" : ""}
        </p>
        <SyncStatus />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-4">{error}</div>}

      {students.length === 0 ? (
        <div className="bg-white border border-border rounded-card p-8 text-center">
          <Users size={22} className="mx-auto text-text-secondary/40 mb-3" />
          <p className="text-sm text-text-secondary">Aucun élève enregistré dans cette classe pour l&apos;instant.</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={markAllPresent}
            className="w-full h-11 mb-4 rounded-card border border-primary/30 bg-primary-light text-primary text-sm font-bold hover:opacity-90 transition-opacity duration-base"
          >
            Tout le monde présent
          </button>

          <div className="bg-white border border-border rounded-card divide-y divide-border overflow-hidden">
            {students.map((student) => (
              <div key={student.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-text-primary min-w-0 truncate">
                  {student.firstName} {student.lastName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(Object.keys(STATUS_CONFIG) as Status[]).map((status) => {
                    const config = STATUS_CONFIG[status];
                    const Icon = config.icon;
                    const active = statuses[student.id] === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-label={`${config.label} pour ${student.firstName} ${student.lastName}`}
                        aria-pressed={active}
                        onClick={() => mark(student.id, status)}
                        className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-base ${
                          active ? config.activeClass : "bg-muted text-text-secondary hover:bg-muted/70"
                        }`}
                      >
                        <Icon size={17} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
