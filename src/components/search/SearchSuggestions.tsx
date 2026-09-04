"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin } from "lucide-react";

type Suggestion = { id: string; name: string; city: string | null; is_claimed: boolean | null };

export function SearchSuggestions({ query, onSelectCity }: { query: string; onSelectCity: (city: string) => void }) {
  const router = useRouter();
  const [cities, setCities] = useState<string[]>([]);
  const [schools, setSchools] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setCities([]);
      setSchools([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        setCities(payload.cities ?? []);
        setSchools(payload.schools ?? []);
        setOpen((payload.cities?.length ?? 0) + (payload.schools?.length ?? 0) > 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setOpen(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (!open) return null;

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-80 overflow-y-auto rounded-xl border border-[#E7E0D7] bg-white p-1.5 text-[#132019] shadow-[0_16px_40px_rgba(11,59,46,0.2)]" role="listbox" aria-label="Suggestions de recherche">
      {cities.map((item) => (
        <button key={`city-${item}`} type="button" onClick={() => { setOpen(false); onSelectCity(item); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4F3EF]" role="option" aria-selected="false">
          <MapPin size={15} className="shrink-0 text-[#1F8A5D]" />
          <span><strong>{item}</strong><span className="ml-1 text-[#5A695F]">— ville</span></span>
        </button>
      ))}
      {schools.map((school) => (
        <button key={school.id} type="button" onClick={() => router.push(school.is_claimed ? `/ecole/${school.id}` : `/auth/inscription?ecole=${school.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4F3EF]" role="option" aria-selected="false">
          <Building2 size={15} className="shrink-0 text-[#1F8A5D]" />
          <span className="min-w-0"><strong className="block truncate">{school.name}</strong>{school.city && <span className="block text-xs text-[#5A695F]">{school.city}</span>}</span>
        </button>
      ))}
    </div>
  );
}
