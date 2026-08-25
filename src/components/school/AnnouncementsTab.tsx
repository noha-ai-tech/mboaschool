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
};

export function AnnouncementsTab({
  schoolId,
  onCountChange,
}: {
  schoolId: string;
  /** CMS-C §13 — permet au parent de masquer la section "actualités" si vide, sans dupliquer ce fetch. */
  onCountChange?: (count: number) => void;
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
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.length === 0 ? (
        <div className="bg-white border border-border rounded-card py-14 text-center">
          <Bell size={28} className="mx-auto text-text-secondary/30 mb-4" />
          <p className="text-sm text-text-secondary">Aucune actualité publiée.</p>
        </div>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className={`bg-white border rounded-card p-5 ${a.is_important ? "border-danger/30" : "border-border"}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {a.is_important && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-danger bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertCircle size={9} /> Important
                </span>
              )}
              <span className="text-[10px] text-text-secondary font-medium">
                {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
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
