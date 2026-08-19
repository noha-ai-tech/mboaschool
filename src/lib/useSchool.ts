"use client";

import { useSchools, type AuthUser, type SchoolData } from "./school/SchoolContext";

export type { SchoolData, AuthUser };

// Compatible avec l'API historique ({ school, user, loading, signOut }) —
// désormais un simple wrapper autour du SchoolContext partagé (voir
// src/lib/school/SchoolContext.tsx) au lieu de refaire son propre fetch.
// `school` correspond à l'établissement ACTIF (le premier par défaut, ou
// celui choisi via le sélecteur si le promoteur en possède plusieurs).
export function useSchool() {
  const { activeSchool, user, loading, signOut } = useSchools();
  return { school: activeSchool, user, loading, signOut };
}
