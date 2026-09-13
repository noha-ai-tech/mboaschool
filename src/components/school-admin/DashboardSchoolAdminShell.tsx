"use client";

import { SchoolAdminShell } from "@/components/school-admin/SchoolAdminShell";
import { useSchools } from "@/lib/school/SchoolContext";

export function DashboardSchoolAdminShell({ children }: { children: React.ReactNode }) {
  const { schools, activeSchool, setActiveSchoolId, user, loading, signOut } = useSchools();
  // DAILY-INTELLIGENCE-02 audit finding (§7/§22): this selector used to be
  // gated on `activeSchool` already being set, so a multi-school owner who
  // had never made a selection yet (no cookie, no ?school= param) saw no
  // way at all to pick one — the shell fell back to "Aucun établissement
  // lié", a message meant for zero establishments, not "several but none
  // chosen yet". Gating on `schools.length > 1` alone, with a disabled
  // placeholder option while nothing is selected, lets that first
  // selection happen through this exact existing mechanism
  // (setActiveSchoolId) — not a new establishment-selection system.
  const selector = schools.length > 1 ? (
    <select
      value={activeSchool?.id ?? ""}
      onChange={(event) => setActiveSchoolId(event.target.value)}
      aria-label="Changer d’établissement actif"
      className="w-full rounded-md border border-white/15 bg-white/10 px-2.5 py-2 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      {!activeSchool && <option value="" disabled>Choisir un établissement</option>}
      {schools.map((school) => <option key={school.id} value={school.id} className="bg-accent text-white">{school.name}</option>)}
    </select>
  ) : null;
  return <SchoolAdminShell schoolId={activeSchool?.id ?? null} schoolName={activeSchool?.name ?? null} schoolCity={activeSchool?.city} schoolVerified={activeSchool?.is_verified} isPro={activeSchool?.forfait === "pro"} loading={loading} userEmail={user?.email} schoolSelector={selector} onSignOut={signOut}>{children}</SchoolAdminShell>;
}
