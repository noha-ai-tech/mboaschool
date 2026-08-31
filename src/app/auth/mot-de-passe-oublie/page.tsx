"use client";

import Link from "next/link";
import { useState } from "react";
import { Fraunces } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";

// Chargée ici uniquement pour l'accroche de AuthBranding (Fraunces) —
// aucun autre texte de cette page n'est concerné par la présente tâche.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal"],
  variable: "--font-fraunces",
  display: "swap",
});

export default function MotDePasseOubliePage() {
  const tickerItems = useSiteTickerItems();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/connexion`,
    });

    setLoading(false);
    if (resetError) {
      setError("Impossible d'envoyer le lien pour le moment. Réessayez dans un instant.");
      return;
    }
    setSent(true);
  }

  return (
    <div className={`min-h-screen bg-background flex flex-col ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="flex-1 flex">
      <AuthBranding />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-10 flex justify-center">
            <Link href="/" className="inline-flex items-center">
              <Logo size="md" priority />
            </Link>
          </div>

          <div className="bg-white rounded-[24px] shadow-elevation-2 p-8">
            <Link
              href="/auth/connexion"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
            >
              <ArrowLeft size={13} />
              Retour à la connexion
            </Link>

            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1.5">
                Mot de passe oublié
              </h1>
              <p className="text-text-secondary text-sm">
                Recevez un lien pour réinitialiser votre mot de passe.
              </p>
            </div>

            {sent ? (
              <div className="bg-primary-light border border-primary/20 text-primary rounded-[10px] px-4 py-3 text-sm font-medium">
                Si un compte existe pour {email}, un lien de réinitialisation vient d&apos;être envoyé.
              </div>
            ) : (
              <>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-6">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                      Adresse email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[52px] rounded-card bg-gradient-to-r from-primary to-primary-dark text-white font-bold text-sm hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Envoyer le lien <ArrowRight size={15} /></>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          <Link href="/" className="block mt-6 text-center text-xs text-text-secondary hover:text-text-primary transition-colors duration-base">
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
