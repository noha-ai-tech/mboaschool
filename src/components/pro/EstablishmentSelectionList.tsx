"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { ACTIVE_SCHOOL_COOKIE, withEstablishmentQuery } from "@/lib/school/establishmentContext";

type Props = {
  schools: { id: string; name: string; city: string | null }[];
  returnPath: string;
};

export function EstablishmentSelectionList({ schools, returnPath }: Props) {
  const router = useRouter();

  function selectSchool(id: string) {
    if (!schools.some((school) => school.id === id)) return;
    document.cookie = `${ACTIVE_SCHOOL_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.push(withEstablishmentQuery(returnPath, id));
  }

  return (
    <div className="grid gap-3">
      {schools.map((school) => (
        <button
          key={school.id}
          type="button"
          onClick={() => selectSchool(school.id)}
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-400"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Building2 size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-slate-900">{school.name}</span>
            <span className="block text-xs text-slate-500">{school.city || "Ville non renseignée"}</span>
          </span>
          <ChevronRight size={18} className="text-slate-400" />
        </button>
      ))}
    </div>
  );
}
