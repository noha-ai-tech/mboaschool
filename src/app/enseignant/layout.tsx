import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeconnexionButton from "@/components/enseignant/DeconnexionButton";
import { Logo } from "@/components/branding/Logo";

export default async function EnseignantLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: enseignant } = user
    ? await supabase
        .from("enseignants")
        .select("nom, prenom")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="min-h-screen bg-[#f5f3ef]">
      <header className="bg-[#0a0f0d] text-white px-6 py-3 flex items-center gap-4">
        <Link href="/enseignant/mon-espace" className="flex items-center">
          <Logo variant="dark" size="md" />
        </Link>
        {enseignant && (
          <>
            <span className="text-white/20">·</span>
            <span className="text-sm text-slate-400">
              {enseignant.prenom} {enseignant.nom}
            </span>
          </>
        )}
        <DeconnexionButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
