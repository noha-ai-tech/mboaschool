import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeconnexionButton from "@/components/enseignant/DeconnexionButton";

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
        <Link href="/enseignant/mon-espace" className="flex items-center gap-2">
          <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
            <div className="absolute inset-0 flex">
              <span className="flex-1 bg-emerald-600 rounded-l-md" />
              <span className="flex-1 bg-red-500" />
              <span className="flex-1 bg-yellow-400 rounded-r-md" />
            </div>
            <svg className="relative z-10 text-white" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span className="text-sm font-black tracking-tight">
            Écoles<span className="text-emerald-400">237</span>
          </span>
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
