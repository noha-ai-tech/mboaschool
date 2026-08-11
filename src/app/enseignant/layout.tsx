"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/branding/Logo";
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
// des liens vers des ancres, jamais des pages inexistantes.
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

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-accent text-white w-full">
      <div className="px-5 py-5 border-b border-white/8">
        <Link href="/" className="flex items-center">
          <Logo variant="dark" size="lg" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item, i) =>
          "group" in item ? (
            <p key={i} className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-600 first:pt-0">
              {item.group}
            </p>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-fast ${
                pathname === "/enseignant/mon-espace" && item.href === "/enseignant/mon-espace"
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          )
        )}
      </nav>

      <div className="px-3 py-4 border-t border-white/8">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors duration-fast w-full"
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex w-[220px] shrink-0 flex-col fixed inset-y-0 left-0 z-40">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[220px] flex flex-col">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-screen">
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
