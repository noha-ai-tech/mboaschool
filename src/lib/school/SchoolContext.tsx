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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../supabase";
import {
  ACTIVE_SCHOOL_COOKIE,
  SCHOOL_QUERY_PARAM,
  resolveEstablishmentContext,
  withEstablishmentQuery,
} from "./establishmentContext";

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
  accessSources?: ("owner" | "staff" | "responsibility" | "platform_admin")[];
};

export type AuthUser = {
  id: string;
  email: string;
};

export { ACTIVE_SCHOOL_COOKIE };

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
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

export function SchoolProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSchoolId, setActiveSchoolIdState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch("/api/establishments/accessible", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        if (!cancelled) setLoading(false);
        return;
      }

      const payload = (await response.json()) as {
        establishments?: SchoolData[];
        user?: AuthUser;
      };
      if (cancelled) return;
      setSchools(payload.establishments ?? []);
      setUser(payload.user ?? null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const resolution = resolveEstablishmentContext({
      explicitId: searchParams.get(SCHOOL_QUERY_PARAM),
      cookieId: readCookie(ACTIVE_SCHOOL_COOKIE),
      accessibleIds: schools.map((school) => school.id),
    });
    setActiveSchoolIdState(resolution.establishmentId);
  }, [loading, schools, searchParams]);

  const setActiveSchoolId = useCallback(
    (id: string) => {
      if (!schools.some((school) => school.id === id)) return;
      writeCookie(ACTIVE_SCHOOL_COOKIE, id);
      setActiveSchoolIdState(id);
      const query = searchParams.toString();
      const current = query ? `${pathname}?${query}` : pathname;
      router.push(withEstablishmentQuery(current, id));
    },
    [pathname, router, schools, searchParams]
  );

  const activeSchool = useMemo(
    () => schools.find((school) => school.id === activeSchoolId) ?? null,
    [schools, activeSchoolId]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, []);

  return (
    <SchoolContext.Provider
      value={{
        schools,
        activeSchool,
        activeSchoolId,
        setActiveSchoolId,
        user,
        loading,
        signOut,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchools() {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error("useSchools() doit être utilisé à l'intérieur de <SchoolProvider>.");
  }
  return context;
}
