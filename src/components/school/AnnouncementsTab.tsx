"use client";

import { useEffect, useState } from "react";
import { Bell, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SchoolAnnouncement = {
  id: string;
  title: string;
  content: string;
  is_important: boolean | null;
  created_at: string;
  event_date: string | null;
  event_start_time: string | null;
};

// PUBLIC-SITE-04 — `event_date` is a Postgres `date` ("YYYY-MM-DD"), never
// a timestamp. `new Date("2026-09-12")` parses as UTC midnight, which
// `.getDate()`/`.toLocaleDateString()` can then render as the PREVIOUS day
// in any timezone behind UTC — parsing the components manually into a
// local-time Date avoids that off-by-one.
function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// The real event date when one was entered (a genuine EVENT); otherwise
// created_at, unchanged fallback behavior for an ordinary ANNOUNCEMENT.
function displayDate(a: SchoolAnnouncement): Date {
  return a.event_date ? parseDateOnly(a.event_date) : new Date(a.created_at);
}

export function AnnouncementsTab({
  schoolId,
  onCountChange,
  variant = "full",
  limit,
}: {
  schoolId: string;
  /** CMS-C §13 — permet au parent de masquer la section "actualités" si vide, sans dupliquer ce fetch. */
  onCountChange?: (count: number) => void;
  /** PUBLIC-SITE-01 §4E — "compact" rend des cartes date-badge pour la
   * bande "Événements à venir" de l'accueil, en réutilisant la même
   * requête plutôt que de la dupliquer. "full" (défaut) est le rendu
   * inchangé de la liste complète (tab Vie & Résultats / Galerie & Infos). */
  variant?: "full" | "compact";
  limit?: number;
}) {
  const [announcements, setAnnouncements] = useState<SchoolAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("school_announcements")
      .select("*")
      .eq("establishment_id", schoolId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAnnouncements(data);
        onCountChange?.(data?.length ?? 0);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  if (loading) {
    return (
      <div className={variant === "compact" ? "flex gap-3" : "space-y-3"}>
        {[1, 2].map((i) => (
          <div key={i} className={variant === "compact" ? "w-44 h-24 bg-white border border-border rounded-card animate-pulse shrink-0" : "h-24 bg-white border border-border rounded-card animate-pulse"} />
        ))}
      </div>
    );
  }

  const visible = limit ? announcements.slice(0, limit) : announcements;

  if (variant === "compact") {
    if (visible.length === 0) return null;
    return (
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((a) => {
          const date = displayDate(a);
          return (
            <div key={a.id} className="w-52 shrink-0 bg-white border border-border rounded-card p-4">
              <div className="inline-flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-primary-light text-primary mb-3">
                <span className="text-[10px] font-bold uppercase leading-none">{date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span>
                <span className="text-sm font-black leading-none mt-0.5">{date.getDate()}</span>
              </div>
              <h3 className="font-bold text-sm text-text-primary leading-snug line-clamp-2">{a.title}</h3>
              {a.content && <p className="text-xs text-text-secondary mt-1 leading-relaxed line-clamp-2">{a.content}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <div className="bg-white border border-border rounded-card py-14 text-center">
          <Bell size={28} className="mx-auto text-text-secondary/30 mb-4" />
          <p className="text-sm text-text-secondary">Aucune actualité publiée.</p>
        </div>
      ) : (
        visible.map((a) => (
          <div key={a.id} className={`bg-white border rounded-card p-5 ${a.is_important ? "border-danger/30" : "border-border"}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {a.is_important && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-danger bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertCircle size={9} /> Important
                </span>
              )}
              <span className="text-[10px] text-text-secondary font-medium">
                {displayDate(a).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                {a.event_date && a.event_start_time ? ` à ${a.event_start_time.slice(0, 5)}` : ""}
              </span>
            </div>
            <h3 className="font-bold text-text-primary mb-1">{a.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{a.content}</p>
          </div>
        ))
      )}
    </div>
  );
}
