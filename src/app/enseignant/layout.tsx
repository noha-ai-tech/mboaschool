"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
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
  CalendarDays,
  Users,
  Clock3,
  Wallet,
  FileText,
  LogOut,
  Menu,
  X,
} from "lucide-react";

// Shell enseignant — toutes les sections vivent aujourd'hui sur UNE seule
// page (/enseignant/mon-espace, ancres #salaire/#horaire/...), il n'existe
// pas de route distincte par section. La sidebar reflète cette réalité :
// des liens vers des ancres, jamais des pages inexistantes. Sidebar
// réductible (Sprint M) via les primitives partagées CollapsibleSidebar.
const NAV = [
  { href: "/enseignant/mon-espace", label: "Aujourd'hui", icon: LayoutDashboard },
  { group: "Mon travail" },
  { href: "/enseignant/mon-espace#horaire", label: "Mon emploi du temps", icon: CalendarDays },
  { href: "/enseignant/mon-espace#classes", label: "Mes classes", icon: Users },
  { href: "/enseignant/mon-espace#presences", label: "Mes présences", icon: Clock3 },
  { href: "/enseignant/mon-espace#heures", label: "Mes heures", icon: Clock3 },
  { group: "Rémunération" },
  { href: "/enseignant/mon-espace#salaire", label: "Mon salaire", icon: Wallet },
  { group: "Ressources" },
  { href: "/enseignant/mon-espace#documents", label: "Mes documents", icon: FileText },
] as const;

export default function EnseignantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle, hydrated } = useSidebarState();
  const effectiveCollapsed = hydrated && collapsed;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const SidebarContent = ({ forceExpanded = false }: { forceExpanded?: boolean }) => {
    const c = forceExpanded ? false : effectiveCollapsed;
    return (
      <>
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

        <nav className={`sidebar-scroll flex-1 py-4 space-y-1 overflow-y-auto ${c ? "px-2" : "px-3"}`}>
          {NAV.map((item, i) =>
            "group" in item ? (
              c ? (
                <div key={i} className="h-px bg-white/8 mx-2 my-2 first:mt-0" aria-hidden="true" />
              ) : (
                <p key={i} className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-600 first:pt-0">
                  {item.group}
                </p>
              )
            ) : (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname === "/enseignant/mon-espace" && item.href === "/enseignant/mon-espace"}
                collapsed={c}
                onClick={() => setMobileOpen(false)}
              />
            )
          )}
        </nav>

        <div className={`shrink-0 border-t border-white/8 ${c ? "px-2 py-4" : "px-3 py-4"}`}>
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
      <div
        className="hidden lg:flex shrink-0 fixed inset-y-0 left-0 z-40 h-[100dvh] transition-[width] duration-200 ease-out"
        style={{ width: effectiveCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      >
        <SidebarShell collapsed={effectiveCollapsed}>
          <SidebarContent />
        </SidebarShell>
        <SidebarToggleButton collapsed={effectiveCollapsed} onClick={toggle} />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] h-[100dvh] flex flex-col bg-accent text-white">
            <SidebarContent forceExpanded />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div
        className={`flex-1 flex flex-col min-h-screen transition-[margin-left] duration-200 ease-out ${
          effectiveCollapsed ? "lg:ml-[76px]" : "lg:ml-[288px]"
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 bg-white border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden" aria-label="Menu">
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm">Aujourd&apos;hui</span>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden" aria-label="Fermer le menu">
            {mobileOpen ? <X size={22} /> : <div className="w-6" />}
          </button>
        </header>

        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
