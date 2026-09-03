"use client";

import { useSearchParams } from "next/navigation";
import { ProSchoolSwitcher } from "@/components/pro/ProSchoolSwitcher";
import { SchoolAdminShell } from "@/components/school-admin/SchoolAdminShell";
import { SCHOOL_QUERY_PARAM } from "@/lib/school/establishmentContext";
import { supabase } from "@/lib/supabase";

type ProSchool = { id: string; name: string; forfait: string | null };

export function ProSchoolAdminShell({ children, schools, fallbackSchoolId, userEmail }: { children: React.ReactNode; schools: ProSchool[]; fallbackSchoolId: string | null; userEmail: string | null }) {
  const searchParams = useSearchParams();
  const explicitId = searchParams.get(SCHOOL_QUERY_PARAM);
  const activeSchoolId = schools.some((school) => school.id === explicitId) ? explicitId : fallbackSchoolId;
  const activeSchool = schools.find((school) => school.id === activeSchoolId) ?? null;
  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }
  return <SchoolAdminShell schoolId={activeSchoolId} schoolName={activeSchool?.name ?? null} isPro={activeSchool?.forfait === "pro"} userEmail={userEmail} schoolSelector={schools.length > 0 ? <ProSchoolSwitcher schools={schools} fallbackSchoolId={fallbackSchoolId} /> : null} onSignOut={signOut}>{children}</SchoolAdminShell>;
}
