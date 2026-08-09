"use client";

// Layout partagé du Platform Operating Center (Mission 08, Phase 3+).
// Remplace la sidebar codée en dur dans l'ancienne page.tsx (Mission 01) —
// même refactor que dashboard/ecole/layout.tsx (Mission 03) : navigation
// centralisée, contenu des pages inchangé au niveau de la structure.
// Le middleware garantit déjà que seul un platform_admin atteint ce layout.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePlatformAdmin } from "@/lib/platform/usePlatformAdmin";
import { can, ADMIN_ROLE_LABELS, type PlatformPermission } from "@/lib/platform/permissions";
import {
  School,
  LayoutDashboard,
  ClipboardCheck,
  Building2,
  Users2,
  CreditCard,
  Wallet,
  LifeBuoy,
  History,
  BarChart3,
  ShieldCheck,
  LogOut,
} from "lucide-react";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
        <div className="absolute inset-0 flex">
          <span className="flex-1 bg-emerald-600 rounded-l-md" />
          <span className="flex-1 bg-red-500" />
          <span className="flex-1 bg-yellow-400 rounded-r-md" />
        </div>
        <School size={15} className="relative z-10 text-white" />
      </div>
      <span className="text-lg font-black tracking-tight text-white">
        Écoles<span className="text-emerald-400">237</span>
      </span>
    </Link>
  );
}

async function handleSignOut() {
  await supabase.auth.signOut();
  window.location.href = "/";
}

const NAV: { href: string; label: string; icon: React.ElementType; permission?: PlatformPermission }[] = [
  { href: "/dashboard/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/dashboard/admin/ecoles", label: "Établissements", icon: Building2, permission: "manage_schools" },
  { href: "/dashboard/admin/verifications", label: "Vérifications", icon: ClipboardCheck, permission: "manage_schools" },
  { href: "/dashboard/admin/crm", label: "CRM", icon: Users2, permission: "manage_crm" },
  { href: "/dashboard/admin/abonnements", label: "Abonnements", icon: CreditCard, permission: "manage_subscriptions" },
  { href: "/dashboard/admin/paiements", label: "Paiements", icon: Wallet, permission: "view_payments" },
  { href: "/dashboard/admin/support", label: "Support", icon: LifeBuoy, permission: "manage_support" },
  { href: "/dashboard/admin/statistiques", label: "Statistiques", icon: BarChart3, permission: "view_statistics" },
  { href: "/dashboard/admin/audit", label: "Journal d'audit", icon: History, permission: "view_audit_log" },
  { href: "/dashboard/admin/administrateurs", label: "Administrateurs", icon: ShieldCheck, permission: "manage_admins" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, loading } = usePlatformAdmin();

  const visibleNav = NAV.filter((item) => !item.permission || can(admin?.adminRole, item.permission));

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-[220px] shrink-0 bg-[#0a0f0d] fixed inset-y-0 left-0 z-40">
        <div className="px-5 py-5 border-b border-white/8">
          <Logo />
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 px-3 mb-3">
            Platform Operating Center
          </p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-emerald-600/20 text-emerald-400" : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="px-3 py-4 border-t border-white/8">
          {!loading && admin?.adminRole && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              {ADMIN_ROLE_LABELS[admin.adminRole]}
            </p>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors w-full"
          >
            <LogOut size={16} />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-[220px] p-6 lg:p-8">
        <div className="max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
