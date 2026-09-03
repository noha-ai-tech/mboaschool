"use client";

// Comportement de sidebar réductible partagé entre les dashboards Écoles237
// Pro (Sprint M, Partie A). Extrait volontairement en primitives légères
// plutôt qu'un unique composant monolithique : chaque layout (dashboard/ecole,
// enseignant, dashboard/admin) garde son propre navGroups()/ses propres
// permissions et son propre rendu de contenu — seule la mécanique
// largeur/animation/collapse/tooltip/persistance est mutualisée ici, pour ne
// pas risquer un refactor massif qui casserait des permissions spécifiques.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "ecoles237-sidebar-collapsed";

export const SIDEBAR_WIDTH_EXPANDED = 288;
export const SIDEBAR_WIDTH_COLLAPSED = 76;

/** Mémorise expanded/collapsed dans localStorage (pas de dépendance backend,
 *  restauré à la prochaine connexion). `hydrated` distingue le premier rendu
 *  serveur (toujours "expanded") de l'état réel une fois le client monté. */
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  return { collapsed, toggle, hydrated };
}

/** Bouton de collapse — bordure droite de la sidebar, cible tactile 40px,
 *  icône seule (pas de gros bouton), visible en permanence. */
export function SidebarToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
      className="hidden lg:flex absolute -right-3.5 top-16 z-10 w-9 h-9 items-center justify-center rounded-full bg-white border border-border shadow-elevation-1 text-slate-500 hover:text-slate-800 hover:shadow-elevation-2 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
    </button>
  );
}

/** Habillage <aside> : largeur animée, header/logo sticky en haut, footer
 *  (profil/déconnexion) sticky en bas, nav scrollable au milieu avec une
 *  scrollbar discrète (classe .sidebar-scroll, définie dans globals.css). */
export function SidebarShell({
  collapsed,
  children,
  className = "",
}: {
  collapsed: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={`relative flex flex-col h-full bg-accent text-white transition-[width] duration-200 ease-out overflow-hidden ${className}`}
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      {children}
    </aside>
  );
}

/** Un item de nav — en collapsed, plus jamais de texte tronqué : le label
 *  disparaît entièrement et un tooltip apparaît au survol/focus. */
export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  locked,
  collapsed,
  onClick,
  trailing,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  locked?: boolean;
  collapsed: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group/item relative flex items-center rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
      } ${active ? "bg-emerald-500/15 text-white shadow-[inset_3px_0_0_#34d399]" : "text-slate-300 hover:text-white hover:bg-white/5"}`}
    >
      <Icon size={16} aria-hidden="true" className={`shrink-0 ${active ? "text-emerald-300" : ""}`} />
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {trailing}
        </>
      )}
      {locked && collapsed && (
        <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-600" aria-hidden="true" />
      )}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-elevation-2 transition-opacity duration-150 group-hover/item:opacity-100 group-focus-visible/item:opacity-100 z-50"
        >
          {label}
        </span>
      )}
    </Link>
  );
}
