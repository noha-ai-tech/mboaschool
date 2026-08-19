"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../supabase";

export type SchoolData = {
  id: string;
  name: string;
  city: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  description?: string | null;
  address?: string | null;
  main_category: string;
  is_verified: boolean;
  subscription_plan: string;
  forfait: "gratuit" | "gere" | "pro";
};

export type AuthUser = {
  id: string;
  email: string;
};

// Nom de cookie partagé avec le helper serveur src/lib/supabase/activeEstablishment.ts —
// une seule source de vérité pour la persistance de l'établissement actif.
export const ACTIVE_SCHOOL_COOKIE = "ecoles237_active_school";

const SCHOOL_COLUMNS =
  "id, name, city, neighborhood, phone, email, whatsapp, website, description, address, main_category, is_verified, subscription_plan, forfait";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  // Pas de flag httpOnly : c'est une préférence d'affichage (quel établissement
  // afficher), jamais une autorisation. Chaque lecture serveur revérifie
  // l'appartenance réelle (voir getActiveEstablishment côté serveur).
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

type SchoolContextValue = {
  schools: SchoolData[];
  activeSchool: SchoolData | null;
  activeSchoolId: string | null;
  setActiveSchoolId: (id: string) => void;
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const SchoolContext = createContext<SchoolContextValue | null>(null);

// Fournit UNE fois (au montage du layout dashboard/ecole) la liste des
// établissements du promoteur + l'utilisateur, au lieu que chacune des pages
// enfants (auparavant 15 appels indépendants à useSchool()) ne refasse le
// même fetch. useSchool() ci-dessous devient un simple consommateur de ce
// contexte, sans requête propre.
export function SchoolProvider({ children }: { children: ReactNode }) {
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSchoolId, setActiveSchoolIdState] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setLoading(false);
        return;
      }

      setUser({ id: authUser.id, email: authUser.email! });

      const { data } = await supabase
        .from("establishments")
        .select(SCHOOL_COLUMNS)
        .eq("owner_id", authUser.id)
        .order("created_at", { ascending: true });

      const owned = (data ?? []) as unknown as SchoolData[];
      setSchools(owned);

      const requested = readCookie(ACTIVE_SCHOOL_COOKIE);
      const initial = (requested && owned.find((s) => s.id === requested)) ?? owned[0] ?? null;
      setActiveSchoolIdState(initial?.id ?? null);
      setLoading(false);
    }

    load();
  }, []);

  const setActiveSchoolId = useCallback(
    (id: string) => {
      if (!schools.some((s) => s.id === id)) return;
      writeCookie(ACTIVE_SCHOOL_COOKIE, id);
      setActiveSchoolIdState(id);
    },
    [schools]
  );

  const activeSchool = useMemo(
    () => schools.find((s) => s.id === activeSchoolId) ?? schools[0] ?? null,
    [schools, activeSchoolId]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, []);

  const value: SchoolContextValue = {
    schools,
    activeSchool,
    activeSchoolId: activeSchool?.id ?? null,
    setActiveSchoolId,
    user,
    loading,
    signOut,
  };

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchools() {
  const ctx = useContext(SchoolContext);
  if (!ctx) {
    throw new Error("useSchools() doit être utilisé à l'intérieur de <SchoolProvider>.");
  }
  return ctx;
}
