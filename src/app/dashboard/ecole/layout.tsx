"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSchool } from "@/lib/useSchool";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { Logo } from "@/components/branding/Logo";
import { Favicon } from "@/components/branding/Favicon";
import {
  LayoutDashboard,
  ClipboardList,
  GraduationCap,
  Bell,
  FileText,
  ImageIcon,
  LogOut,
  CheckCircle2,
  ChevronRight,
  Menu,
  X,
  Settings,
  Building2,
  CalendarDays,
  Clock3,
  BarChart3,
  LifeBuoy,
  Lock,
} from "lucide-react";
import { useState } from "react";

// Navigation du School Operating Center (Mission 03, Phase 2).
// Chaque groupe correspond à un pôle d'activité du directeur d'établissement.
// Les modules Enseignants / Emplois du temps / Présences pointent vers le
// module Pro existant (src/app/pro/*, inchangé) — verrouillés visuellement
// si le forfait n'est pas "pro", cohérent avec /pro/acces-restreint déjà en
// place. Aucun de ces modules n'est redéveloppé ici (voir docs/dashboard/01_ARCHITECTURE.md).
const navGroups = (isPro: boolean) => [
  {
    label: null,
    items: [
      { href: "/dashboard/ecole", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Gestion",
    items: [
      { href: "/dashboard/ecole/etablissement", label: "Mon établissement", icon: Building2 },
      { href: "/dashboard/ecole/admissions", label: "Admissions", icon: ClipboardList },
      { href: isPro ? "/pro/enseignants" : "/pro/acces-restreint", label: "Enseignants", icon: GraduationCap, locked: !isPro },
      { href: isPro ? "/pro/emplois-du-temps" : "/pro/acces-restreint", label: "Emplois du temps", icon: CalendarDays, locked: !isPro },
      { href: isPro ? "/pro/pointage/historique" : "/pro/acces-restreint", label: "Présences", icon: Clock3, locked: !isPro },
    ],
  },
  {
    label: "Contenu",
    items: [
      { href: "/dashboard/ecole/centre-documentaire", label: "Documents", icon: FileText },
      { href: "/dashboard/ecole/galerie", label: "Galerie", icon: ImageIcon },
      { href: "/dashboard/ecole/annonces", label: "Actualités", icon: Bell },
    ],
  },
  {
    label: "Pilotage",
    items: [
      { href: "/dashboard/ecole/statistiques", label: "Statistiques", icon: BarChart3 },
      { href: "/dashboard/ecole/parametres", label: "Paramètres", icon: Settings },
      { href: "/dashboard/ecole/support", label: "Support", icon: LifeBuoy },
    ],
  },
];

export default function EcoleDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { school, user, loading, signOut } = useSchool();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPro = school?.forfait === "pro";
  const groups = navGroups(isPro);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-[#0a0f0d] text-white w-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <Link href="/" className="flex items-center gap-2">
          <Favicon size="sm" />
          <Logo variant="dark" size="sm" />
        </Link>
      </div>

      {/* School info */}
      <div className="px-5 py-4 border-b border-white/8">
        {loading ? (
          <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
        ) : school ? (
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 mb-1">
              Établissement actif
            </p>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-snug truncate">{school.name}</p>
                <p className="text-xs text-slate-400">{school.city}</p>
              </div>
              {school.is_verified && (
                <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500 mb-2">Aucune école liée</p>
            <Link
              href="/dashboard/ecole/onboarding"
              className="text-xs text-emerald-400 font-semibold hover:text-emerald-300"
            >
              Lier mon établissement →
            </Link>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-600">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, "exact" in item ? item.exact : undefined);
                const locked = "locked" in item && item.locked;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-emerald-600/20 text-emerald-400"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-emerald-400" : ""} />
                    {item.label}
                    {locked ? (
                      <Lock size={11} className="ml-auto text-slate-600" />
                    ) : (
                      active && <ChevronRight size={12} className="ml-auto text-emerald-400" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-white/8">
        {user && (
          <p className="px-3 text-[11px] text-slate-500 truncate mb-2">{user.email}</p>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors w-full"
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-[220px] shrink-0 flex-col fixed inset-y-0 left-0 z-40">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[220px] flex flex-col">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-screen">
        {/* Top bar — mobile menu toggle + notifications, visible on all sizes */}
        <header className="flex items-center justify-between px-5 h-14 bg-white border-b border-[#ebebeb]">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden">
            <Menu size={22} />
          </button>
          <span className="font-black text-sm lg:hidden">
            {school?.name ?? "Dashboard"}
          </span>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationBell schoolId={school?.id ?? null} />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              {mobileOpen ? <X size={22} /> : <div className="w-6" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
