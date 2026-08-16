"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSchool } from "@/lib/useSchool";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { Logo } from "@/components/branding/Logo";
import {
  useSidebarState,
  SidebarShell,
  SidebarToggleButton,
  SidebarNavItem,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
} from "@/components/layout/CollapsibleSidebar";
import {
  LayoutDashboard,
  ClipboardList,
  GraduationCap,
  Bell,
  FileText,
  ImageIcon,
  LogOut,
  CheckCircle2,
  Menu,
  X,
  Settings,
  Building2,
  CalendarDays,
  Clock3,
  BarChart3,
  LifeBuoy,
  Lock,
  CreditCard,
} from "lucide-react";
import { useState } from "react";

// Navigation du School Operating Center (Mission 03, Phase 2 ; sidebar
// réductible Sprint M). Chaque groupe correspond à un pôle d'activité du
// directeur d'établissement. Les modules Enseignants / Emplois du temps /
// Présences pointent vers le module Pro existant (src/app/pro/*, inchangé) —
// verrouillés visuellement si le forfait n'est pas "pro", cohérent avec
// /pro/acces-restreint déjà en place. Aucun de ces modules n'est redéveloppé
// ici (voir docs/dashboard/01_ARCHITECTURE.md).
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
      { href: "/dashboard/ecole/admissions", label: "Admissions", icon: ClipboardList },
      { href: isPro ? "/pro/enseignants" : "/pro/acces-restreint", label: "Personnel", icon: GraduationCap, locked: !isPro },
      { href: isPro ? "/pro/emplois-du-temps" : "/pro/acces-restreint", label: "Emplois du temps", icon: CalendarDays, locked: !isPro },
      { href: isPro ? "/pro/pointage/historique" : "/pro/acces-restreint", label: "Présences", icon: Clock3, locked: !isPro },
      { href: isPro ? "/pro/paie" : "/pro/acces-restreint", label: "Paie", icon: CreditCard, locked: !isPro },
    ],
  },
  {
    label: "Établissement",
    items: [
      { href: "/dashboard/ecole/etablissement", label: "Ma fiche publique", icon: Building2 },
      { href: "/dashboard/ecole/galerie", label: "Galerie", icon: ImageIcon },
      { href: "/dashboard/ecole/annonces", label: "Actualités", icon: Bell },
      { href: "/dashboard/ecole/centre-documentaire", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Outils",
    items: [
      { href: "/dashboard/ecole/statistiques", label: "Statistiques", icon: BarChart3 },
      { href: "/dashboard/ecole/support", label: "Support", icon: LifeBuoy },
      { href: "/dashboard/ecole/parametres", label: "Paramètres", icon: Settings },
    ],
  },
];

export default function EcoleDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { school, user, loading, signOut } = useSchool();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle, hydrated } = useSidebarState();

  const isPro = school?.forfait === "pro";
  const groups = navGroups(isPro);
  const effectiveCollapsed = hydrated && collapsed;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const SidebarContent = ({ forceExpanded = false }: { forceExpanded?: boolean }) => {
    const c = forceExpanded ? false : effectiveCollapsed;
    return (
      <>
        {/* Logo — sticky top */}
        <div className={`shrink-0 border-b border-white/8 ${c ? "px-0 py-5 flex justify-center" : "px-5 py-5"}`}>
          <Link href="/" className="flex items-center">
            {c ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/branding/favicon.png" alt="Écoles237" className="w-9 h-9 rounded-lg" />
            ) : (
              <Logo variant="dark" size="lg" />
            )}
          </Link>
        </div>

        {/* École active — masqué en collapsed (jamais de texte tronqué) */}
        {!c && (
          <div className="shrink-0 px-5 py-4 border-b border-white/8">
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
                <Link href="/dashboard/ecole/onboarding" className="text-xs text-emerald-400 font-semibold hover:text-emerald-300">
                  Lier mon établissement →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Nav — scrollable, scrollbar discrète */}
        <nav className={`sidebar-scroll flex-1 py-4 space-y-4 overflow-y-auto ${c ? "px-2" : "px-3"}`}>
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.label && !c && (
                <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-600">
                  {group.label}
                </p>
              )}
              {group.label && c && <div className="h-px bg-white/8 mx-2 mb-2" aria-hidden="true" />}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href, "exact" in item ? item.exact : undefined);
                  const locked = "locked" in item && item.locked;
                  return (
                    <SidebarNavItem
                      key={item.label}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={active}
                      locked={locked}
                      collapsed={c}
                      onClick={() => setMobileOpen(false)}
                      trailing={locked ? <Lock size={11} className="ml-auto text-slate-600" /> : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profil + déconnexion — sticky bottom */}
        <div className={`shrink-0 border-t border-white/8 ${c ? "px-2 py-4" : "px-3 py-4"}`}>
          {user && !c && (
            <p className="px-3 text-[11px] text-slate-500 truncate mb-2">{user.email}</p>
          )}
          <button
            onClick={signOut}
            aria-label="Se déconnecter"
            className={`group/item relative flex items-center rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors w-full ${
              c ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            }`}
          >
            <LogOut size={16} className="shrink-0" />
            {!c && "Se déconnecter"}
            {c && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-elevation-2 transition-opacity duration-150 group-hover/item:opacity-100 group-focus-visible/item:opacity-100 z-50"
              >
                Se déconnecter
              </span>
            )}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <div
        className="hidden lg:flex shrink-0 fixed inset-y-0 left-0 z-40 h-[100dvh] transition-[width] duration-200 ease-out"
        style={{ width: effectiveCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      >
        <SidebarShell collapsed={effectiveCollapsed}>
          <SidebarContent />
        </SidebarShell>
        <SidebarToggleButton collapsed={effectiveCollapsed} onClick={toggle} />
      </div>

      {/* Mobile sidebar (drawer) — toujours pleine largeur, jamais l'état collapsed */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] h-[100dvh] flex flex-col bg-accent text-white">
            <SidebarContent forceExpanded />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-[margin-left] duration-200 ease-out ${
          effectiveCollapsed ? "lg:ml-[76px]" : "lg:ml-[288px]"
        }`}
      >
        {/* Top bar — mobile menu toggle + notifications, visible on all sizes */}
        <header className="flex items-center justify-between px-5 h-14 bg-white border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden" aria-label="Ouvrir le menu">
            <Menu size={22} />
          </button>
          <span className="font-black text-sm lg:hidden">
            {school?.name ?? "Dashboard"}
          </span>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationBell schoolId={school?.id ?? null} />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden" aria-label="Fermer le menu">
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
