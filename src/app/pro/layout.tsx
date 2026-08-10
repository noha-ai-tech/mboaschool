import Link from "next/link";
import { Logo } from "@/components/branding/Logo";

const NAV = [
  { href: "/pro/personnel",                    label: "Personnel" },
  { href: "/pro/emplois-du-temps",             label: "Emplois du temps" },
  { href: "/pro/matieres",                     label: "Matières" },
  { href: "/pro/salles",                       label: "Salles" },
  { href: "/pro/parametres/emploi-du-temps",   label: "Contraintes EDT" },
  { href: "/pro/pointage/kiosque",             label: "Kiosque présence" },
  { href: "/pro/pointage/historique",          label: "Historique présence" },
  { href: "/pro/remplacements",                label: "Remplacements" },
  { href: "/pro/absences",                     label: "Absences" },
  { href: "/pro/paie",                         label: "Paie" },
  { href: "/pro/enseignants",                  label: "Enseignants" },
  { href: "/pro/messagerie",                   label: "Messagerie" },
];

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f7f2]">
      <header className="bg-accent text-white">
        {/* Ligne 1 : logo + retour tableau de bord */}
        <div className="px-6 py-3 flex items-center gap-4 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Logo variant="dark" size="lg" />
            <span className="text-base font-black tracking-tight">
              <span className="text-emerald-400 font-bold">Pro</span>
            </span>
          </Link>
          <div className="ml-auto">
            <Link
              href="/dashboard/ecole"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              ← Tableau de bord
            </Link>
          </div>
        </div>

        {/* Ligne 2 : navigation */}
        <nav className="px-6 flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent hover:border-emerald-500"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}
