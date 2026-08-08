"use client";

// Centre de notifications (Mission 03, Phase 6) — architecture uniquement.
// "Nouvelles demandes" est la seule entrée calculée depuis une donnée réelle
// (candidatures en attente). Les autres entrées sont des emplacements
// architecturaux : aucun système de notification réel (websocket, file
// d'attente, base d'événements) n'est connecté, conformément à la consigne
// "ne pas connecter un système réel — créer uniquement l'architecture".

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Bell, ClipboardList, UserCog, FileWarning, Sparkles, LifeBuoy } from "lucide-react";

export function NotificationBell({ schoolId }: { schoolId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", schoolId)
      .eq("status", "pending")
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [schoolId]);

  const items = [
    {
      icon: ClipboardList,
      label: "Nouvelles demandes",
      detail: pendingCount === null ? "—" : `${pendingCount} en attente`,
      href: "/dashboard/ecole/admissions",
      active: (pendingCount ?? 0) > 0,
    },
    {
      icon: UserCog,
      label: "Profil incomplet",
      detail: "Voir la checklist",
      href: "/dashboard/ecole",
      active: false,
    },
    {
      icon: FileWarning,
      label: "Documents rejetés",
      detail: "Aucun système de validation documentaire pour l'instant",
      href: "/dashboard/ecole/centre-documentaire",
      active: false,
    },
    {
      icon: Sparkles,
      label: "Nouvelles fonctionnalités",
      detail: "Rien de nouveau pour l'instant",
      href: "/dashboard/ecole/support",
      active: false,
    },
    {
      icon: LifeBuoy,
      label: "Support",
      detail: "Une question ? Contactez l'équipe",
      href: "/dashboard/ecole/support",
      active: false,
    },
  ];

  const badgeCount = pendingCount ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative p-2 rounded-lg text-slate-400 hover:text-[#0a0a0a] hover:bg-slate-100 transition-colors"
      >
        <Bell size={18} />
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#ebebeb] rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#ebebeb]">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-400">Notifications</p>
            </div>
            <div className="divide-y divide-[#f5f5f5] max-h-96 overflow-y-auto">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <Icon size={15} className={item.active ? "text-emerald-600 mt-0.5" : "text-slate-300 mt-0.5"} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0a0a0a]">{item.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
