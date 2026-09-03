"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fraunces } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { getWeakPasswordSignInMessage } from "@/lib/auth/passwordSecurity";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";

// Typographie de marque (skill ecoles237-design-system) — Fraunces pour le
// titre éditorial, Plus Jakarta Sans (police globale du site, voir
// src/app/layout.tsx) pour tout le reste.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal"],
  variable: "--font-fraunces",
  display: "swap",
});

export default function ConnexionPage() {
  const tickerItems = useSiteTickerItems();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weakPasswordNotice, setWeakPasswordNotice] = useState<string | null>(
    null
  );
  const [authenticatedDestination, setAuthenticatedDestination] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    let destination = "/dashboard/ecole";
    if (profile?.role === "platform_admin") {
      destination = "/dashboard/admin";
    } else if (profile?.role === "teacher") {
      destination = "/enseignant/mon-espace";
    } else {
      // AMÉLIORATION 1 — même logique d'accès que le dashboard/SchoolContext
      // (src/app/api/establishments/accessible, déjà utilisé par
      // src/lib/school/SchoolContext.tsx) : un compte sans établissement lié
      // (ni propriétaire, ni membre du staff) est envoyé vers le formulaire de
      // liaison/inscription plutôt que sur un dashboard vide. En cas d'échec
      // de la vérification, on ne bloque jamais la connexion : repli sur le
      // dashboard existant.
      let hasSchool = true;
      try {
        const accessRes = await fetch("/api/establishments/accessible", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (accessRes.ok) {
          const payload = (await accessRes.json()) as { establishments?: unknown[] };
          hasSchool = (payload.establishments?.length ?? 0) > 0;
        }
      } catch {
        // Repli sûr : ne pas empêcher l'accès au dashboard sur un problème réseau.
      }
      destination = hasSchool ? "/dashboard/ecole" : "/revendiquer";
    }

    // PRO-05.3 — un mot de passe signalé faible par Supabase Auth n'empêche
    // jamais la connexion (déjà authentifié), mais affiche un avertissement
    // non bloquant avant de poursuivre vers la destination résolue ci-dessus.
    const passwordNotice = getWeakPasswordSignInMessage(data.weakPassword);
    if (passwordNotice) {
      setWeakPasswordNotice(passwordNotice);
      setAuthenticatedDestination(destination);
      setLoading(false);
      return;
    }

    router.push(destination);
  }

  return (
    <div className={`min-h-screen bg-[#FBF6F2] flex flex-col ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="flex-1 flex flex-col lg:flex-row">
        <AuthBranding />

        {/* Panel connexion — fond crème de marque, large surface épurée */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 lg:py-12 bg-[#FBF6F2]">
          <div className="w-full max-w-[400px]">
            <div className="mb-7">
              <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[#132019] mb-1.5">
                Connexion
              </h1>
              <p className="text-[#5A695F] text-sm">
                Accédez à votre espace Écoles237.
              </p>
            </div>

            {weakPasswordNotice ? (
              <div
                role="status"
                className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
              >
                <p className="font-semibold">Mot de passe à renforcer</p>
                <p className="mt-1 leading-relaxed">{weakPasswordNotice}</p>
                <button
                  type="button"
                  onClick={() => router.push(authenticatedDestination)}
                  className="mt-4 inline-flex items-center gap-2 font-bold text-amber-950 underline underline-offset-4"
                >
                  Continuer vers mon espace <ArrowRight size={14} />
                </button>
              </div>
            ) : null}

            {error && !weakPasswordNotice && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-6">
                {error}
              </div>
            )}

            {!weakPasswordNotice ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-[#5A695F] uppercase tracking-wider mb-2">
                    Adresse e-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full h-[52px] border border-[#E7E0D7] rounded-xl px-4 text-sm bg-white text-[#132019] placeholder:text-[#5A695F]/70 outline-none focus:border-[#1F8A5D] transition-colors duration-base"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-[#5A695F] uppercase tracking-wider mb-2">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-[52px] border border-[#E7E0D7] rounded-xl px-4 pr-11 text-sm bg-white text-[#132019] placeholder:text-[#5A695F]/70 outline-none focus:border-[#1F8A5D] transition-colors duration-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5A695F] hover:text-[#132019]"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link href="/auth/mot-de-passe-oublie" className="text-xs font-semibold text-[#1F8A5D] hover:opacity-80 transition-opacity duration-base">
                    Mot de passe oublié ?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[52px] rounded-xl bg-[#F2AE1F] text-[#0B3B2E] font-bold text-sm hover:bg-[#D6941A] hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#0B3B2E]/30 border-t-[#0B3B2E] rounded-full animate-spin" />
                      Connexion…
                    </>
                  ) : (
                    <>Se connecter <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            ) : null}

            <div className="mt-5">
              <Link
                href="/auth/inscription"
                className="w-full h-[48px] flex items-center justify-center rounded-xl border border-[#E7E0D7] text-[#5A695F] text-sm font-semibold hover:border-[#5A695F] hover:text-[#132019] transition-colors duration-base"
              >
                Créer un compte
              </Link>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#5A695F]">
              <Lock size={12} aria-hidden="true" />
              Accès sécurisé à votre espace Écoles237.
            </p>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
