"use client";

// Layout partagé du Centre National de Pilotage (Sprint K, V5). Réorganise la
// navigation du Platform Operating Center (Mission 08) en groupes nationaux
// (Registre / Statistiques / Finances / Paramètres) sans toucher aux pages
// existantes ni à leur logique — seule la navigation et l'habillage changent
// ici. Le middleware garantit déjà que seul un platform_admin atteint ce
// layout (inchangé).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePlatformAdmin } from "@/lib/platform/usePlatformAdmin";
import { can, ADMIN_ROLE_LABELS, type PlatformPermission } from "@/lib/platform/permissions";
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
  Building2,
  ClipboardCheck,
  CreditCard,
  Users2,
  LifeBuoy,
  BarChart3,
  Map as MapIcon,
  Wallet,
  ShieldCheck,
  History,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Database,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; permission?: PlatformPermission };
type NavGroup = { label: string | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard/admin", label: "Vue d'ensemble", icon: LayoutDashboard }],
  },
  {
    label: "Registre",
    items: [
      { href: "/dashboard/admin/ecoles", label: "Établissements", icon: Building2, permission: "manage_schools" },
      { href: "/dashboard/admin/registre", label: "Registre national", icon: Database, permission: "manage_schools" },
      { href: "/dashboard/admin/verifications", label: "Revendications", icon: ClipboardCheck, permission: "manage_schools" },
      { href: "/dashboard/admin/abonnements", label: "Abonnements", icon: CreditCard, permission: "manage_subscriptions" },
      { href: "/dashboard/admin/crm", label: "CRM", icon: Users2, permission: "manage_crm" },
      { href: "/dashboard/admin/support", label: "Support", icon: LifeBuoy, permission: "manage_support" },
    ],
  },
  {
    label: "Statistiques",
    items: [
      { href: "/dashboard/admin/statistiques", label: "Rapports", icon: BarChart3, permission: "view_statistics" },
      { href: "/dashboard/admin/carte", label: "Carte nationale", icon: MapIcon, permission: "view_statistics" },
    ],
  },
  {
    label: "Finances",
    items: [{ href: "/dashboard/admin/paiements", label: "Paiements", icon: Wallet, permission: "view_payments" }],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/dashboard/admin/administrateurs", label: "Sécurité", icon: ShieldCheck, permission: "manage_admins" },
      { href: "/dashboard/admin/audit", label: "Logs", icon: History, permission: "view_audit_log" },
    ],
  },
];

type SearchResult = { id: string; name: string; city: string | null };

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("establishments")
        .select("id, name, city")
        .or(`name.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(6);
      setResults(data ?? []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function goTo(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/dashboard/admin/ecoles/${id}`);
  }

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md">
      <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-xl px-3.5 py-2">
        <Search size={15} className="text-slate-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Rechercher un établissement, une ville…"
          className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border rounded-xl shadow-elevation-2 overflow-hidden z-50">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => goTo(r.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
            >
              <Building2 size={14} className="text-slate-300 shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">{r.name}</span>
              <span className="text-xs text-slate-400 shrink-0 ml-auto">{r.city ?? "—"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, loading } = usePlatformAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const { collapsed, toggle, hydrated } = useSidebarState();
  const effectiveCollapsed = hydrated && collapsed;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.permission || can(admin?.adminRole, item.permission)),
  })).filter((g) => g.items.length > 0);

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

        <nav className={`sidebar-scroll flex-1 py-4 overflow-y-auto ${c ? "px-2" : "px-3"}`}>
          {visibleGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && !c && (
                <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-600">
                  {group.label}
                </p>
              )}
              {group.label && c && gi > 0 && <div className="h-px bg-white/8 mx-2 mb-2" aria-hidden="true" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={pathname === item.href}
                    collapsed={c}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`shrink-0 border-t border-white/8 ${c ? "px-2 py-4" : "px-3 py-4"}`}>
          {!loading && admin?.adminRole && !c && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              {ADMIN_ROLE_LABELS[admin.adminRole]}
            </p>
          )}
          <button
            onClick={handleSignOut}
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
        <header className="flex items-center gap-4 px-5 h-16 bg-white border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden shrink-0" aria-label="Menu">
            <Menu size={22} />
          </button>

          <div className="hidden sm:flex flex-1">
            <GlobalSearch />
          </div>

          <div className="relative ml-auto shrink-0">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2.5 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0">
                {(admin?.fullName ?? email ?? "A").charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-text-primary leading-tight truncate max-w-[140px]">
                  {admin?.fullName ?? "Administrateur"}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {admin?.adminRole ? ADMIN_ROLE_LABELS[admin.adminRole] : "—"}
                </p>
              </div>
              <ChevronDown size={14} className="text-slate-400 hidden md:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border rounded-xl shadow-elevation-2 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-text-primary truncate">{email ?? "—"}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-text-primary transition-colors"
                >
                  <LogOut size={14} /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
