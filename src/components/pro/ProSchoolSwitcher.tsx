"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ACTIVE_SCHOOL_COOKIE,
  SCHOOL_QUERY_PARAM,
  withEstablishmentQuery,
} from "@/lib/school/establishmentContext";

type Props = {
  schools: { id: string; name: string }[];
  fallbackSchoolId: string | null;
};

export function ProSchoolSwitcher({ schools, fallbackSchoolId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const explicitId = searchParams.get(SCHOOL_QUERY_PARAM);
  const activeSchoolId =
    schools.find((school) => school.id === explicitId)?.id ?? fallbackSchoolId;

  function handleChange(id: string) {
    if (!schools.some((school) => school.id === id)) return;
    document.cookie = `${ACTIVE_SCHOOL_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const query = searchParams.toString();
    const current = query ? `${pathname}?${query}` : pathname;
    router.push(withEstablishmentQuery(current, id));
  }

  if (schools.length === 1) {
    return (
      <span className="max-w-[220px] truncate rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white">
        {schools[0].name}
      </span>
    );
  }

  return (
    <select
      value={activeSchoolId ?? ""}
      onChange={(event) => handleChange(event.target.value)}
      aria-label="Changer d'établissement actif"
      className="w-full rounded-md border border-white/15 bg-white/10 px-2.5 py-2 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      {!activeSchoolId && <option value="">Sélectionner un établissement</option>}
      {schools.map((school) => (
        <option key={school.id} value={school.id} className="bg-[#0a0a0a]">
          {school.name}
        </option>
      ))}
    </select>
  );
}
