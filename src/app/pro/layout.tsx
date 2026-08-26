import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Logo } from "@/components/branding/Logo";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/supabase/activeEstablishment";
import { ProSchoolSwitcher } from "@/components/pro/ProSchoolSwitcher";
import { ProContextLink, ProNavigation } from "@/components/pro/ProNavigation";
import { isValidEstablishmentId } from "@/lib/school/establishmentContext";

const NAV = [
  { href: "/pro/organisation",                 label: "Organisation" },
  { href: "/pro/configurer-etablissement",     label: "Configurer mon établissement" },
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

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let schools: { id: string; name: string }[] = [];
  let activeSchoolId: string | null = null;

  if (user) {
    const { data } = await supabase
      .from("establishments")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("forfait", "pro")
      .order("created_at", { ascending: true });
    schools = data ?? [];

    const cookieStore = await cookies();
    const requestedId = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
    const match = isValidEstablishmentId(requestedId)
      ? schools.find((school) => school.id === requestedId)
      : undefined;
    activeSchoolId = match?.id ?? (schools.length === 1 ? schools[0].id : null);
  }

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
          {schools.length > 0 && (
            <Suspense fallback={<div className="h-8 w-40 rounded-md bg-white/10" />}>
              <ProSchoolSwitcher schools={schools} fallbackSchoolId={activeSchoolId} />
            </Suspense>
          )}
          <div className="ml-auto">
            <Suspense fallback={<span className="text-sm text-slate-400">Tableau de bord</span>}>
              <ProContextLink
                href="/dashboard/ecole"
                accessibleSchoolIds={schools.map((school) => school.id)}
                fallbackSchoolId={activeSchoolId}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                ← Tableau de bord
              </ProContextLink>
            </Suspense>
          </div>
        </div>

        {/* Ligne 2 : navigation */}
        <Suspense fallback={<div className="h-10 border-t border-white/5" />}>
          <ProNavigation
            items={NAV}
            accessibleSchoolIds={schools.map((school) => school.id)}
            fallbackSchoolId={activeSchoolId}
          />
        </Suspense>
      </header>

      <main>{children}</main>
    </div>
  );
}
