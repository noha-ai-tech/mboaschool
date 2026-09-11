"use client";

import { useEffect } from "react";
import { setCachedEntity, todayScheduleCacheKey, classRosterCacheKey } from "@/lib/offline/entityCache";

// MOBILE-01 (OFFLINE-01 Phase 12) — écrit dans le cache local, EN LIGNE
// seulement (ce composant est rendu par une page serveur qui vient de
// réussir sa propre requête), le strict nécessaire pour continuer à
// travailler hors-ligne aujourd'hui : l'emploi du temps du jour et les
// rosters des seules classes concernées. Ne rend rien — composant de
// câblage, pas d'UI.

export type TeacherDaySchedule = {
  emploiDuTempsId: string;
  classeId: string;
  matiereId: string;
  matiereNom: string;
  classeNom: string;
  heureDebut: string;
  heureFin: string;
};

export type ClassRoster = {
  classeId: string;
  students: { id: string; firstName: string; lastName: string }[];
};

export function TeacherDayCachePrimer({
  teacherEnseignantId,
  dateStr,
  establishmentId,
  schedule,
  rosters,
}: {
  teacherEnseignantId: string;
  dateStr: string;
  establishmentId: string;
  schedule: TeacherDaySchedule[];
  rosters: ClassRoster[];
}) {
  useEffect(() => {
    setCachedEntity(todayScheduleCacheKey(teacherEnseignantId, dateStr), { establishmentId, schedule }).catch(() => {});
    for (const roster of rosters) {
      setCachedEntity(classRosterCacheKey(roster.classeId), roster.students).catch(() => {});
    }
    // Volontairement dépendant de la référence de `schedule`/`rosters`
    // (nouvelles requêtes serveur à chaque navigation) plutôt que d'un
    // intervalle : ce composant écrit une fois par chargement de page
    // réussi, jamais en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherEnseignantId, dateStr, establishmentId]);

  return null;
}
