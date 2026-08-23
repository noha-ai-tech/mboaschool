"use client";

import { useRouter } from "next/navigation";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/school/SchoolContext";

type Props = {
  schools: { id: string; name: string }[];
  activeSchoolId: string | null;
};

// Sélecteur compact, affiché uniquement quand le promoteur possède 2+
// établissements (voir src/app/pro/layout.tsx). router.refresh() relance les
// server components de la page /pro courante, qui relisent le cookie via
// getActiveEstablishment() côté serveur — jamais de données périmées d'un
// autre établissement après un changement.
export function ProSchoolSwitcher({ schools, activeSchoolId }: Props) {
  const router = useRouter();

  function handleChange(id: string) {
    document.cookie = `${ACTIVE_SCHOOL_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <select
      value={activeSchoolId ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Changer d'établissement actif"
      className="shrink-0 rounded-md bg-white/10 border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
    >
      {schools.map((s) => (
        <option key={s.id} value={s.id} className="bg-[#0a0a0a]">
          {s.name}
        </option>
      ))}
    </select>
  );
}
