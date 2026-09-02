"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, BookOpen, Building2, CalendarDays, CheckCircle2,
  CircleDollarSign, ClipboardCheck, ClipboardList, Clock3, CreditCard,
  FileText, GraduationCap, ImageIcon, LayoutDashboard, LifeBuoy, Lock,
  LogOut, Menu, MessageSquare, PanelsTopLeft, Settings, ShieldCheck, Users, X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/branding/Logo";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { SchoolAdminSkeleton } from "@/components/school-admin/ui/Feedback";
import {
  SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED, SidebarNavItem,
  SidebarShell, SidebarToggleButton, useSidebarState,
} from "@/components/layout/CollapsibleSidebar";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  requiresPro?: boolean;
};

type NavigationGroup = { label: string; items: NavigationItem[] };

const NAVIGATION_GROUPS: NavigationGroup[] = [
  { label: "Vue d’ensemble", items: [
    { href: "/dashboard/ecole", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  ] },
  { label: "Admissions", items: [
    { href: "/dashboard/ecole/admissions", label: "Candidatures", icon: ClipboardList },
  ] },
  { label: "Gestion scolaire", items: [
    { href: "/dashboard/ecole/classes", label: "Classes", icon: GraduationCap },
    { href: "/pro/matieres", label: "Matières", icon: BookOpen, requiresPro: true },
    { href: "/pro/salles", label: "Salles", icon: Building2, requiresPro: true },
  ] },
  { label: "Personnel et enseignants", items: [
    { href: "/pro/personnel", label: "Personnel", icon: Users, requiresPro: true },
    { href: "/pro/enseignants", label: "Enseignants", icon: GraduationCap, requiresPro: true },
  ] },
  { label: "Présences", items: [
    { href: "/pro/pointage/kiosque", label: "Kiosque de présence", icon: ClipboardCheck, requiresPro: true },
    { href: "/pro/pointage/historique", label: "Historique", icon: Clock3, requiresPro: true },
    { href: "/pro/absences", label: "Absences", icon: ShieldCheck, requiresPro: true },
  ] },
  { label: "Planification", items: [
    { href: "/pro/emplois-du-temps", label: "Emplois du temps", icon: CalendarDays, requiresPro: true },
    { href: "/pro/parametres/emploi-du-temps", label: "Contraintes", icon: Settings, requiresPro: true },
    { href: "/pro/remplacements", label: "Remplacements", icon: Clock3, requiresPro: true },
  ] },
  { label: "Paie et frais", items: [
    { href: "/pro/paie", label: "Paie", icon: CreditCard, requiresPro: true },
    { href: "/dashboard/ecole/frais", label: "Frais scolaires", icon: CircleDollarSign },
    { href: "/dashboard/ecole/paiements", label: "Paiements", icon: CreditCard },
  ] },
  { label: "Communications", items: [
    { href: "/pro/messagerie", label: "Messagerie", icon: MessageSquare, requiresPro: true },
    { href: "/dashboard/ecole/annonces", label: "Actualités", icon: Bell },
  ] },
  { label: "Documents et CMS", items: [
    { href: "/dashboard/ecole/etablissement", label: "Fiche publique", icon: PanelsTopLeft },
    { href: "/dashboard/ecole/galerie", label: "Galerie", icon: ImageIcon },
    { href: "/dashboard/ecole/documents", label: "Documents", icon: FileText },
    { href: "/dashboard/ecole/centre-documentaire", label: "Centre documentaire", icon: BookOpen },
  ] },
  { label: "Configuration", items: [
    { href: "/pro/organisation", label: "Organisation", icon: Building2, requiresPro: true },
    { href: "/pro/configurer-etablissement", label: "Configurer l’établissement", icon: Settings, requiresPro: true },
    { href: "/dashboard/ecole/infrastructure", label: "Infrastructure", icon: Building2 },
    { href: "/dashboard/ecole/statistiques", label: "Statistiques", icon: BarChart3 },
    { href: "/dashboard/ecole/support", label: "Support", icon: LifeBuoy },
    { href: "/dashboard/ecole/parametres", label: "Paramètres", icon: Settings },
  ] },
];

type Props = {
  children: ReactNode;
  schoolId: string | null;
  schoolName: string | null;
  schoolCity?: string | null;
  schoolVerified?: boolean;
  isPro: boolean;
  loading?: boolean;
  userEmail?: string | null;
  schoolSelector?: ReactNode;
  onSignOut: () => void | Promise<void>;
};

function routeIsActive(pathname: string, item: NavigationItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SchoolAdminShell({
  children, schoolId, schoolName, schoolCity, schoolVerified = false,
  isPro, loading = false, userEmail, schoolSelector, onSignOut,
}: Props) {
  const pathname = usePathname();
  const { collapsed, toggle, hydrated } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const effectiveCollapsed = hydrated && collapsed;
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const mainElement = mainRef.current;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    mainElement?.setAttribute("inert", "");
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      mainElement?.removeAttribute("inert");
      menuButton?.focus();
    };
  }, [mobileOpen]);

  function SidebarContent({ forceExpanded = false }: { forceExpanded?: boolean }) {
    const isCollapsed = forceExpanded ? false : effectiveCollapsed;
    return <>
      <div className={`shrink-0 border-b border-white/10 ${isCollapsed ? "flex justify-center px-0 py-5" : "flex items-center px-5 py-5"}`}>
        <Link href={withEstablishmentQuery("/dashboard/ecole", schoolId)} className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400" aria-label={isCollapsed ? "Écoles237 — Tableau de bord" : undefined}>
          {isCollapsed ? <Image src="/branding/favicon.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" /> : <Logo variant="dark" size="lg" />}
        </Link>
        {forceExpanded && <button ref={closeButtonRef} type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer la navigation" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"><X size={20} aria-hidden="true" /></button>}
      </div>

      {!isCollapsed && <div className="shrink-0 border-b border-white/10 px-5 py-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Établissement actif</p>
        {loading ? <SchoolAdminSkeleton className="h-11" tone="inverse" label="Chargement de l’établissement" /> : schoolName ? <div>
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{schoolName}</p>{schoolCity && <p className="truncate text-xs text-slate-400">{schoolCity}</p>}</div>{schoolVerified && <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-label="Établissement vérifié" />}</div>
          {schoolSelector && <div className="mt-2">{schoolSelector}</div>}
        </div> : <Link href="/dashboard/ecole/onboarding" className="text-xs font-semibold text-emerald-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">Lier mon établissement</Link>}
      </div>}

      <nav aria-label="Navigation de l’administration scolaire" className={`sidebar-scroll flex-1 space-y-4 overflow-y-auto py-4 ${isCollapsed ? "px-2" : "px-3"}`}>
        {NAVIGATION_GROUPS.map((group) => <div key={group.label}>
          {!isCollapsed ? <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p> : <div className="mx-2 mb-2 h-px bg-white/10" aria-hidden="true" />}
          <div className="space-y-0.5">{group.items.map((item) => {
            const locked = Boolean(item.requiresPro && !isPro);
            const destination = locked ? "/pro/acces-restreint" : item.href;
            return <SidebarNavItem key={item.href} href={withEstablishmentQuery(destination, schoolId)} label={item.label} icon={item.icon} active={routeIsActive(pathname, item)} locked={locked} collapsed={isCollapsed} onClick={() => setMobileOpen(false)} trailing={locked ? <Lock size={12} className="ml-auto text-slate-500" aria-label="Fonctionnalité Pro" /> : undefined} />;
          })}</div>
        </div>)}
      </nav>

      <div className={`shrink-0 border-t border-white/10 ${isCollapsed ? "px-2 py-4" : "px-3 py-4"}`}>
        {userEmail && !isCollapsed && <p className="mb-2 truncate px-3 text-[11px] text-slate-400">{userEmail}</p>}
        <button type="button" onClick={onSignOut} aria-label="Se déconnecter" className={`group/item relative flex w-full items-center rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}`}><LogOut size={16} aria-hidden="true" />{!isCollapsed && "Se déconnecter"}{isCollapsed && <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-xs text-white opacity-0 shadow-elevation-2 group-hover/item:opacity-100 group-focus-visible/item:opacity-100">Se déconnecter</span>}</button>
      </div>
    </>;
  }

  return <div className="school-admin-theme flex min-h-screen bg-[var(--school-admin-background)] text-[var(--school-admin-text)]">
    <div className="fixed inset-y-0 left-0 z-40 hidden h-[100dvh] shrink-0 transition-[width] duration-200 lg:flex" style={{ width: effectiveCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}><SidebarShell collapsed={effectiveCollapsed}><SidebarContent /></SidebarShell><SidebarToggleButton collapsed={effectiveCollapsed} onClick={toggle} /></div>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} aria-label="Fermer la navigation" tabIndex={-1} /><div id={drawerId} ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation de l’administration scolaire" className="relative flex h-[100dvh] w-[min(88vw,320px)] flex-col bg-accent text-white shadow-elevation-3"><SidebarContent forceExpanded /></div></div>}
    <div ref={mainRef} className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[margin-left] duration-200 ${effectiveCollapsed ? "lg:ml-[76px]" : "lg:ml-[288px]"}`}>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
        <button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)} aria-label="Ouvrir la navigation" aria-expanded={mobileOpen} aria-controls={drawerId} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 lg:hidden"><Menu size={21} aria-hidden="true" /></button>
        <div className="min-w-0 lg:hidden"><p className="truncate text-sm font-bold text-text-primary">{schoolName ?? "Administration scolaire"}</p><p className="text-[11px] font-medium text-emerald-700">Écoles237</p></div>
        <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 lg:block">Administration scolaire</p>
        <div className="ml-auto flex items-center gap-1"><NotificationBell schoolId={schoolId} /><div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />{userEmail && <span className="hidden max-w-56 truncate px-2 text-xs font-medium text-text-secondary md:block">{userEmail}</span>}</div>
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>;
}
